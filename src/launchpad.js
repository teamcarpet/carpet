import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { CONFIG } from './config.js';
import idl from './idl/launchpad.json';

const PROGRAM_ID = new PublicKey(CONFIG.LAUNCHPAD.programId);

function getProvider(wallet) {
  const connection = new Connection(CONFIG.solanaRpc, 'confirmed');
  return new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
}

export function getProgram(wallet) {
  const provider = getProvider(wallet);
  return new Program(idl, provider);
}

// ── PDA helpers ──────────────────────────────────────────────────────────

export function getConfigPda() {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID
  );
  return pda;
}

export function getBondingPoolPda(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding_pool'), mint.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function getBondingSolVaultPda(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding_sol_vault'), mint.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function getBondingTokenVaultPda(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding_token_vault'), mint.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function getPositionPda(pool, user) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), pool.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

// ── Bonding curve ────────────────────────────────────────────────────────

export async function createBondingPool(wallet, mint) {
  const program = getProgram(wallet);
  const mintPk = new PublicKey(mint);

  return await program.methods
    .createBondingPool({
      virtualSolReserves: null,
      virtualTokenReserves: null,
      tokenSupply: null,
      migrationTarget: null,
    })
    .accounts({
      creator: wallet.publicKey,
      config: getConfigPda(),
      mint: mintPk,
      pool: getBondingPoolPda(mintPk),
      solVault: getBondingSolVaultPda(mintPk),
      tokenVault: getBondingTokenVaultPda(mintPk),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function buyTokens(wallet, mint, solAmount, minTokensOut = 0) {
  const program = getProgram(wallet);
  const mintPk = new PublicKey(mint);
  const poolPda = getBondingPoolPda(mintPk);

  const config = await program.account.globalConfig.fetch(getConfigPda());
  const buyerAta = await getAssociatedTokenAddress(mintPk, wallet.publicKey);

  return await program.methods
    .buyBonding(new BN(solAmount), new BN(minTokensOut))
    .accounts({
      buyer: wallet.publicKey,
      config: getConfigPda(),
      pool: poolPda,
      buyerPosition: getPositionPda(poolPda, wallet.publicKey),
      solVault: getBondingSolVaultPda(mintPk),
      tokenVault: getBondingTokenVaultPda(mintPk),
      buyerTokenAccount: buyerAta,
      devWallet: config.devWallet,
      platformWallet: config.platformWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function sellTokens(wallet, mint, tokenAmount, minSolOut = 0) {
  const program = getProgram(wallet);
  const mintPk = new PublicKey(mint);
  const poolPda = getBondingPoolPda(mintPk);

  const config = await program.account.globalConfig.fetch(getConfigPda());
  const sellerAta = await getAssociatedTokenAddress(mintPk, wallet.publicKey);

  return await program.methods
    .sellBonding(new BN(tokenAmount), new BN(minSolOut))
    .accounts({
      seller: wallet.publicKey,
      config: getConfigPda(),
      pool: poolPda,
      solVault: getBondingSolVaultPda(mintPk),
      tokenVault: getBondingTokenVaultPda(mintPk),
      sellerTokenAccount: sellerAta,
      platformWallet: config.platformWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

// ── Pool data ────────────────────────────────────────────────────────────

export async function getPoolData(wallet, mint) {
  const program = getProgram(wallet);
  const mintPk = new PublicKey(mint);
  const poolPda = getBondingPoolPda(mintPk);

  try {
    return await program.account.bondingCurvePool.fetch(poolPda);
  } catch {
    return null;
  }
}