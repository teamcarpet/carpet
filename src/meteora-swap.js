// Trading a graduated token on its Meteora DAMM v2 pool.
// The pool address comes from the token's buyback state, which the program
// records at migration, so the frontend never trusts an API for it.
// The SDK is loaded on demand — only graduated token pages need it.

import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import { CONFIG } from './config.js';
import {
  getConnection, getReadOnlyProgram, getBondingPoolPda, getPresalePoolPda, getBuybackStatePda,
} from './launchpad.js';
import { getPublicKey, signAndSendTransaction } from './wallet.js';

let sdk = null;
const loadSdk = async () => (sdk ??= await import('@meteora-ag/cp-amm-sdk'));

async function meteoraPoolFor(mint, mode) {
  const program = getReadOnlyProgram();
  const pool = mode === 'presale' ? getPresalePoolPda(mint) : getBondingPoolPda(mint);
  const state = await program.account.buybackState.fetch(getBuybackStatePda(pool));
  return state.meteoraPool;
}

// side: 'buy' (SOL → token, amount in SOL) or 'sell' (token → SOL, amount in tokens)
export async function quoteMeteora({ mint, mode, side, amount, decimals = 6 }) {
  const { CpAmm } = await loadSdk();
  const conn = getConnection();
  const cp = new CpAmm(conn);
  const poolAddress = await meteoraPoolFor(mint, mode);
  const poolState = await cp.fetchPoolState(poolAddress);
  const inputMint = side === 'buy' ? NATIVE_MINT : poolState.tokenBMint;
  const inAmount = new BN(Math.floor(amount * 10 ** (side === 'buy' ? 9 : decimals)).toString());
  const slot = await conn.getSlot();
  const time = Math.floor(Date.now() / 1000);
  const q = cp.getQuote({
    inAmount, inputTokenMint: inputMint, slippage: CONFIG.slippageBps / 100,
    poolState, currentTime: time, currentSlot: slot,
  });
  return { cp, poolAddress, poolState, inputMint, inAmount, quote: q };
}

export async function swapMeteora(opts) {
  const payer = getPublicKey();
  if (!payer) throw new Error('Wallet not connected');
  const { cp, poolAddress, poolState, inputMint, inAmount, quote } = await quoteMeteora(opts);
  const outputMint = inputMint.equals(poolState.tokenAMint) ? poolState.tokenBMint : poolState.tokenAMint;
  const tx = await cp.swap({
    payer,
    pool: poolAddress,
    inputTokenMint: inputMint,
    outputTokenMint: outputMint,
    amountIn: inAmount,
    minimumAmountOut: quote.minSwapOutAmount,
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    referralTokenAccount: null,
    poolState,
  });
  tx.feePayer = payer;
  return signAndSendTransaction(tx);
}
