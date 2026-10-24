import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { CONFIG } from './config.js';
import { getAnchorWallet, getWalletProvider } from './wallet.js';
import idlJson from './idl/launchpad.json';

export const PROGRAM_ID = new PublicKey(CONFIG.LAUNCHPAD.programId);
export const METEORA_PROGRAM_ID = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG');

const DEFAULT_TOKEN_SUPPLY_RAW = 1_000_000_000_000_000;
const DEFAULT_BONDING_MIGRATION_TARGET = 100_000_000_000;
const DEFAULT_PRESALE_END_SECONDS = 24 * 60 * 60;
const COMPUTE_BUDGET_IXS = [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
];

function normalizeIdl(idl) {
  const clone = structuredClone(idl);
  clone.address = CONFIG.LAUNCHPAD.programId;
  clone.metadata = { ...(clone.metadata || {}), address: CONFIG.LAUNCHPAD.programId };
  const typesByName = new Map((clone.types || []).map((typeDef) => [typeDef.name, typeDef]));
  clone.accounts = (clone.accounts || []).map((account) => {
    if (account.type) return account;
    const typeDef = typesByName.get(account.name);
    return typeDef ? { ...account, type: typeDef.type } : account;
  });
  return clone;
}

const idl = normalizeIdl(idlJson);

export function getConnection(rpcUrl = CONFIG.solanaRpc) {
  return new Connection(rpcUrl, 'confirmed');
}

export function getProvider(wallet = getAnchorWallet()) {
  assertWalletMatchesProvider(wallet);
  return new AnchorProvider(getConnection(), wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
}

export function getProgram(wallet = getAnchorWallet()) {
  return new Program(idl, getProvider(wallet));
}

// For account reads only — works without a connected wallet.
export function getReadOnlyProgram(connection = getConnection()) {
  const readOnlyWallet = {
    publicKey: PublicKey.default,
    signTransaction: () => Promise.reject(new Error('Read-only program')),
    signAllTransactions: () => Promise.reject(new Error('Read-only program')),
  };
  return new Program(idl, new AnchorProvider(connection, readOnlyWallet, { commitment: 'confirmed' }));
}

export function solscanTxUrl(signature) {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

export function solscanAccountUrl(address) {
  return `https://solscan.io/account/${address.toBase58 ? address.toBase58() : address}?cluster=devnet`;
}

function bn(value) {
  if (BN.isBN(value)) return value;
  if (typeof value === 'bigint') return new BN(value.toString());
  return new BN(String(value));
}

// Mirrors math/bonding_curve.rs + math/fees.rs so the client can set a real
// min-out instead of 0 (which would let anyone sandwich the trade).
const BPS = 10_000n;
const big = (v) => BigInt(v.toString());
// Mirrors the program: reserves after a trade round up, in the pool's favour.
const ceilDiv = (a, b) => (a + b - 1n) / b;

export function quoteBuy(pool, config, lamports) {
  const sol = big(lamports);
  const fee = (sol * (BigInt(config.devFeeBps) + BigInt(config.platformFeeBps))) / BPS;
  const net = sol - fee;
  const vsr = big(pool.virtualSolReserves);
  const vtr = big(pool.virtualTokenReserves);
  return vtr - ceilDiv(vsr * vtr, vsr + net);
}

export function quoteSell(pool, config, tokenAmount) {
  const tokens = big(tokenAmount);
  const vsr = big(pool.virtualSolReserves);
  const vtr = big(pool.virtualTokenReserves);
  const gross = vsr - ceilDiv(vsr * vtr, vtr + tokens);
  const cut = (bps) => (gross * BigInt(bps)) / BPS;
  return gross - cut(config.devFeeBps) - cut(config.platformFeeBps) - cut(config.sellTaxBps);
}

// What this wallet can still do on a bonding curve right now:
//   maxBuyLamports — SOL (incl. 1% fee) that buys exactly up to the 1% wallet
//                    cap; inverse of the curve: net = vsr·t / (vtr − t)
//   tokenBalance   — tokens held, for Sell → Max
export async function getTradeAllowance(owner, mint, mode = 'bonding') {
  const program = getReadOnlyProgram();
  const mintPk = pk(mint), ownerPk = pk(owner);
  if (mode === 'presale') return getPresaleStatus(ownerPk, mintPk);
  const poolPda = getBondingPoolPda(mintPk);
  const [pool, config, position, ata] = await Promise.all([
    program.account.bondingCurvePool.fetch(poolPda),
    program.account.globalConfig.fetch(getConfigPda()),
    program.account.userPosition.fetchNullable(getPositionPda(poolPda, ownerPk)),
    getAssociatedTokenAddress(mintPk, ownerPk),
  ]);
  if (pool.isMigrated) {
    let tokenBalance = 0;
    try { tokenBalance = Number((await getConnection().getTokenAccountBalance(ata)).value.uiAmount) || 0; } catch {}
    return { migrated: true, tokenBalance };
  }
  const cap = (big(pool.initialRealTokenReserves) * BigInt(pool.maxBuyBps)) / BPS;
  const bought = position ? big(position.amount) : 0n;
  let tokensLeft = cap > bought ? cap - bought : 0n;
  const real = big(pool.realTokenReserves);
  if (tokensLeft > real) tokensLeft = real;
  const vsr = big(pool.virtualSolReserves), vtr = big(pool.virtualTokenReserves);
  let maxBuyLamports = 0n;
  if (tokensLeft > 0n && vtr > tokensLeft) {
    const net = (vsr * tokensLeft) / (vtr - tokensLeft);
    const feeBps = BigInt(config.devFeeBps) + BigInt(config.platformFeeBps);
    maxBuyLamports = (net * BPS) / (BPS - feeBps);
  }
  let tokenBalance = 0;
  try {
    const bal = await getConnection().getTokenAccountBalance(ata);
    tokenBalance = Number(bal.value.uiAmount) || 0;
  } catch { /* no token account yet */ }
  return {
    maxBuySol: Number(maxBuyLamports) / 1e9,
    capReached: tokensLeft === 0n,
    tokenBalance,
    migrating: big(pool.realSolReserves) >= big(pool.migrationTarget),
  };
}

// Presale state for this wallet: what the trade panel can offer right now.
async function getPresaleStatus(ownerPk, mintPk) {
  const program = getReadOnlyProgram();
  const poolPda = getPresalePoolPda(mintPk);
  const [pool, position] = await Promise.all([
    program.account.presalePool.fetch(poolPda),
    program.account.userPosition.fetchNullable(getPositionPda(poolPda, ownerPk)),
  ]);
  const now = Math.floor(Date.now() / 1000);
  const raised = big(pool.currentRaised), target = big(pool.migrationTarget);
  const contributed = position ? Number(big(position.amount)) / 1e9 : 0;
  const ended = now > Number(pool.endTime);
  const filled = raised >= target;
  const cap = (target * BigInt(pool.maxBuyBps)) / BPS;
  const mine = position ? big(position.amount) : 0n;
  const left = target > raised ? target - raised : 0n;
  let room = cap > mine ? cap - mine : 0n;
  if (room > left) room = left;
  const feeBps = 100n; // presale entry fee (config.presalePlatformFeeBps)
  return {
    presale: true,
    migrated: pool.isMigrated,
    ended, filled, contributed,
    maxBuySol: Number((room * BPS) / (BPS - feeBps)) / 1e9,
    canRefund: ended && !filled && !pool.isMigrated && contributed > 0 && !position?.refundClaimed,
    canClaim: pool.isMigrated && contributed > 0 && !position?.tokensClaimed,
    claimed: !!position?.tokensClaimed,
    refunded: !!position?.refundClaimed,
  };
}

export async function refundPresale(wallet, mint) {
  const program = getProgram(wallet);
  const mintPk = pk(mint);
  const poolPda = getPresalePoolPda(mintPk);
  return program.methods
    .refundPresale()
    .accounts({
      user: wallet.publicKey,
      config: getConfigPda(),
      pool: poolPda,
      userPosition: getPositionPda(poolPda, wallet.publicKey),
      solVault: getPresaleSolVaultPda(mintPk),
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

// Anchor's raw "AnchorError … Error Code: X" → a sentence a trader understands.
const FRIENDLY_ERRORS = {
  ExceedsMaxBuy: 'That buy goes over the 1% per-wallet limit. Lower the amount or press Max.',
  ExceedsMaxContribution: 'That goes over the 1% per-wallet limit for this presale.',
  SlippageExceeded: 'Price moved before your trade landed. Try again.',
  MigrationTargetReached: 'This token hit its target and is moving to Meteora. Trading reopens there in about a minute.',
  SellsLockedAtTarget: 'This token hit its target and is moving to Meteora. Trading reopens there in about a minute.',
  InsufficientTokenReserves: 'Not enough tokens left on the curve for that amount.',
  InsufficientSolReserves: 'The curve can’t pay out that much right now. Try a smaller sell.',
  PresaleEnded: 'This presale has ended.',
  TargetReached: 'This presale is already full.',
  ContributionExceedsTarget: 'That would overfill the presale. Lower the amount.',
  PlatformPaused: 'Trading is paused right now.',
  PoolPaused: 'Trading on this token is paused right now.',
  NothingToClaim: 'Nothing to claim yet — creator tokens unlock gradually over 30 days.',
  AlreadyClaimed: 'You already claimed your tokens.',
  AlreadyRefunded: 'You already took your refund.',
  PresaleNotEnded: 'Refunds open when the presale ends.',
  NotMigrated: 'Tokens can be claimed once the presale graduates.',
  AlreadyMigrated: 'This token has graduated — it now trades on Meteora.',
};
export function friendlyError(err) {
  const msg = String(err?.message || err || '');
  const code = msg.match(/Error Code: (\w+)/)?.[1] || err?.error?.errorCode?.code;
  if (code && FRIENDLY_ERRORS[code]) return FRIENDLY_ERRORS[code];
  if (/User rejected|rejected the request/i.test(msg)) return 'Cancelled in wallet.';
  if (/insufficient lamports|Attempt to debit an account but found no record of a prior credit/i.test(msg)) return 'Not enough SOL in your wallet for this trade and fees.';
  return msg.replace(/^AnchorError[^.]*\.\s*/, '').slice(0, 160);
}

export function withSlippage(amount, bps = CONFIG.slippageBps) {
  return (big(amount) * (BPS - BigInt(bps))) / BPS;
}

function pk(value) {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

function assertWalletMatchesProvider(wallet) {
  if (!wallet?.publicKey) throw new Error('Wallet not connected');
  const provider = getWalletProvider();
  const providerPk = provider?.publicKey;
  if (!provider || !providerPk) throw new Error('Wallet not connected');
  const providerAddress = providerPk.toBase58 ? providerPk.toBase58() : String(providerPk);
  if (providerAddress !== wallet.publicKey.toBase58()) {
    throw new Error('Connected wallet changed. Reconnect your wallet and try again.');
  }
}

function presaleMode(mode) {
  if (mode === 1 || String(mode).toLowerCase() === 'extreme') return { extreme: {} };
  return { regular: {} };
}

async function ataIx(mint, owner, payer = owner) {
  const address = await getAssociatedTokenAddress(mint, owner);
  return {
    address,
    instruction: createAssociatedTokenAccountIdempotentInstruction(
      payer,
      address,
      owner,
      mint,
    ),
  };
}

// ── PDA helpers ──────────────────────────────────────────────────────────

export function getConfigPda() {
  return PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID)[0];
}

export function getBondingPoolPda(mint) {
  return PublicKey.findProgramAddressSync([Buffer.from('bonding_pool'), pk(mint).toBuffer()], PROGRAM_ID)[0];
}

export function getPresalePoolPda(mint) {
  return PublicKey.findProgramAddressSync([Buffer.from('presale_pool'), pk(mint).toBuffer()], PROGRAM_ID)[0];
}

export function getPoolPda(mint, mode = 'bonding') {
  return mode === 'presale' ? getPresalePoolPda(mint) : getBondingPoolPda(mint);
}

export function getBondingSolVaultPda(mint) {
  return PublicKey.findProgramAddressSync([Buffer.from('bonding_sol_vault'), pk(mint).toBuffer()], PROGRAM_ID)[0];
}

export function getBondingTokenVaultPda(mint) {
  return PublicKey.findProgramAddressSync([Buffer.from('bonding_token_vault'), pk(mint).toBuffer()], PROGRAM_ID)[0];
}

export function getPresaleSolVaultPda(mint) {
  return PublicKey.findProgramAddressSync([Buffer.from('presale_sol_vault'), pk(mint).toBuffer()], PROGRAM_ID)[0];
}

export function getPresaleTokenVaultPda(mint) {
  return PublicKey.findProgramAddressSync([Buffer.from('presale_token_vault'), pk(mint).toBuffer()], PROGRAM_ID)[0];
}

export function getPositionPda(pool, user) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), pk(pool).toBuffer(), pk(user).toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function getBuybackStatePda(pool) {
  return PublicKey.findProgramAddressSync([Buffer.from('buyback'), pk(pool).toBuffer()], PROGRAM_ID)[0];
}

export function getBuybackTokenVaultPda(pool) {
  return PublicKey.findProgramAddressSync([Buffer.from('buyback_token_vault'), pk(pool).toBuffer()], PROGRAM_ID)[0];
}

export function getLpCustodyPda(pool) {
  return PublicKey.findProgramAddressSync([Buffer.from('lp_custody'), pk(pool).toBuffer()], PROGRAM_ID)[0];
}

export function getLpFeeVaultPda(pool, feeMint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('lp_fee_vault'), pk(pool).toBuffer(), pk(feeMint).toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function getMeteoraEventAuthorityPda() {
  return PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], METEORA_PROGRAM_ID)[0];
}

// ── Pool creation ────────────────────────────────────────────────────────

export async function createBondingPool(wallet, mint, params = {}) {
  const program = getProgram(wallet);
  const mintPk = pk(mint);

  const call = program.methods
    .createBondingPool({
      virtualSolReserves: params.virtualSolReserves == null ? null : bn(params.virtualSolReserves),
      virtualTokenReserves: params.virtualTokenReserves == null ? null : bn(params.virtualTokenReserves),
      tokenSupply: params.tokenSupply == null ? null : bn(params.tokenSupply),
      migrationTarget: params.migrationTarget == null ? null : bn(params.migrationTarget),
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
    });
  return params.asInstruction ? call.instruction() : call.rpc();
}

export async function createPresalePool(wallet, mint, params = {}) {
  const program = getProgram(wallet);
  const mintPk = pk(mint);
  const endTime = params.endTimeUnix ?? Math.floor(Date.now() / 1000) + DEFAULT_PRESALE_END_SECONDS;

  const call = program.methods
    .createPresalePool({
      migrationTarget: bn(params.migrationTarget ?? DEFAULT_BONDING_MIGRATION_TARGET),
      tokenSupply: bn(params.tokenSupply ?? DEFAULT_TOKEN_SUPPLY_RAW),
      endTime: bn(endTime),
      creatorPoolBps: params.creatorPoolBps ?? null,
      presaleMode: presaleMode(params.presaleMode),
    })
    .accounts({
      creator: wallet.publicKey,
      config: getConfigPda(),
      mint: mintPk,
      pool: getPresalePoolPda(mintPk),
      solVault: getPresaleSolVaultPda(mintPk),
      tokenVault: getPresaleTokenVaultPda(mintPk),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
  return params.asInstruction ? call.instruction() : call.rpc();
}

export async function createLaunchpadPool(wallet, mint, { mode = 'bonding', presaleMode: modeArg = 0, asInstruction = false } = {}) {
  if (mode === 'presale') {
    return createPresalePool(wallet, mint, { presaleMode: modeArg, asInstruction });
  }
  return createBondingPool(wallet, mint, { asInstruction });
}

// ── Bonding curve ────────────────────────────────────────────────────────

export async function buyBonding(wallet, mint, solAmount, minTokensOut = null) {
  const program = getProgram(wallet);
  const mintPk = pk(mint);
  const poolPda = getBondingPoolPda(mintPk);
  const config = await program.account.globalConfig.fetch(getConfigPda());
  const pool = await program.account.bondingCurvePool.fetch(poolPda);
  if (minTokensOut == null) minTokensOut = withSlippage(quoteBuy(pool, config, solAmount));
  if (big(minTokensOut) <= 0n) throw new Error('Amount too small to receive any tokens');
  const buyerAta = await ataIx(mintPk, wallet.publicKey);

  return program.methods
    .buyBonding(bn(solAmount), bn(minTokensOut))
    .accounts({
      buyer: wallet.publicKey,
      config: getConfigPda(),
      pool: poolPda,
      buyerPosition: getPositionPda(poolPda, wallet.publicKey),
      solVault: getBondingSolVaultPda(mintPk),
      tokenVault: getBondingTokenVaultPda(mintPk),
      buyerTokenAccount: buyerAta.address,
      creatorWallet: pool.creator,
      platformWallet: config.platformWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([buyerAta.instruction])
    .rpc();
}

export async function sellBonding(wallet, mint, tokenAmount, minSolOut = null) {
  const program = getProgram(wallet);
  const mintPk = pk(mint);
  const poolPda = getBondingPoolPda(mintPk);
  const config = await program.account.globalConfig.fetch(getConfigPda());
  const pool = await program.account.bondingCurvePool.fetch(poolPda);
  if (minSolOut == null) minSolOut = withSlippage(quoteSell(pool, config, tokenAmount));
  if (big(minSolOut) <= 0n) throw new Error('Amount too small to receive any SOL');
  const sellerAta = await getAssociatedTokenAddress(mintPk, wallet.publicKey);

  return program.methods
    .sellBonding(bn(tokenAmount), bn(minSolOut), config.sellTaxBps)
    .accounts({
      seller: wallet.publicKey,
      config: getConfigPda(),
      pool: poolPda,
      solVault: getBondingSolVaultPda(mintPk),
      tokenVault: getBondingTokenVaultPda(mintPk),
      sellerTokenAccount: sellerAta,
      creatorWallet: pool.creator,
      platformWallet: config.platformWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export const buyTokens = buyBonding;
export const sellTokens = sellBonding;

// ── Presale ───────────────────────────────────────────────────────────────

export async function contributePresale(wallet, mint, solAmount) {
  const program = getProgram(wallet);
  const mintPk = pk(mint);
  const poolPda = getPresalePoolPda(mintPk);
  const config = await program.account.globalConfig.fetch(getConfigPda());

  return program.methods
    .contributePresale(bn(solAmount))
    .accounts({
      contributor: wallet.publicKey,
      config: getConfigPda(),
      pool: poolPda,
      solVault: getPresaleSolVaultPda(mintPk),
      userPosition: getPositionPda(poolPda, wallet.publicKey),
      platformWallet: config.platformWallet,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function claimPresale(wallet, mint) {
  const program = getProgram(wallet);
  const mintPk = pk(mint);
  const poolPda = getPresalePoolPda(mintPk);
  const userAta = await ataIx(mintPk, wallet.publicKey);

  return program.methods
    .claimPresale()
    .accounts({
      user: wallet.publicKey,
      config: getConfigPda(),
      pool: poolPda,
      buybackState: getBuybackStatePda(poolPda),
      userPosition: getPositionPda(poolPda, wallet.publicKey),
      tokenVault: getPresaleTokenVaultPda(mintPk),
      userTokenAccount: userAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([userAta.instruction])
    .rpc();
}

export async function claimCreatorTokens(wallet, mint) {
  const program = getProgram(wallet);
  const mintPk = pk(mint);
  const poolPda = getPresalePoolPda(mintPk);
  const creatorAta = await ataIx(mintPk, wallet.publicKey);

  return program.methods
    .claimCreatorTokens()
    .accounts({
      creator: wallet.publicKey,
      config: getConfigPda(),
      pool: poolPda,
      buybackState: getBuybackStatePda(poolPda),
      tokenVault: getPresaleTokenVaultPda(mintPk),
      creatorTokenAccount: creatorAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([creatorAta.instruction])
    .rpc();
}

// ── Migration and fees ───────────────────────────────────────────────────

function requireMeteoraAccounts(accounts = {}) {
  const required = [
    'meteoraPool',
    'meteoraPoolConfig',
    'meteoraPoolAuthority',
    'positionNftAccount',
    'positionAccount',
    'meteoraVaultA',
    'meteoraVaultB',
    'meteoraTokenABadge',
    'meteoraTokenBBadge',
    'payerWsolAccount',
    'payerTokenAccount',
  ];
  const missing = required.filter((key) => !accounts[key]);
  if (missing.length) {
    throw new Error(`Migration requires Meteora accounts: ${missing.join(', ')}`);
  }
}

export async function migrateBonding(wallet, mint, meteoraAccounts = {}) {
  requireMeteoraAccounts(meteoraAccounts);
  const program = getProgram(wallet);
  const mintPk = pk(mint);
  const poolPda = getBondingPoolPda(mintPk);
  const config = await program.account.globalConfig.fetch(getConfigPda());
  const positionNftMint = meteoraAccounts.positionNftMintKeypair || Keypair.generate();

  return program.methods
    .migrateBonding()
    .accounts({
      payer: wallet.publicKey,
      config: getConfigPda(),
      pool: poolPda,
      solVault: getBondingSolVaultPda(mintPk),
      tokenVault: getBondingTokenVaultPda(mintPk),
      buybackState: getBuybackStatePda(poolPda),
      buybackTokenVault: getBuybackTokenVaultPda(poolPda),
      platformWallet: config.platformWallet,
      meteoraProgram: METEORA_PROGRAM_ID,
      meteoraPool: pk(meteoraAccounts.meteoraPool),
      meteoraPoolConfig: pk(meteoraAccounts.meteoraPoolConfig),
      meteoraPoolAuthority: pk(meteoraAccounts.meteoraPoolAuthority),
      token2022Program: TOKEN_2022_PROGRAM_ID,
      meteoraEventAuthority: meteoraAccounts.meteoraEventAuthority ? pk(meteoraAccounts.meteoraEventAuthority) : getMeteoraEventAuthorityPda(),
      lpCustody: getLpCustodyPda(poolPda),
      positionNftMint: positionNftMint.publicKey,
      positionNftAccount: pk(meteoraAccounts.positionNftAccount),
      positionAccount: pk(meteoraAccounts.positionAccount),
      meteoraVaultA: pk(meteoraAccounts.meteoraVaultA),
      meteoraVaultB: pk(meteoraAccounts.meteoraVaultB),
      meteoraTokenABadge: pk(meteoraAccounts.meteoraTokenABadge),
      meteoraTokenBBadge: pk(meteoraAccounts.meteoraTokenBBadge),
      wsolMint: NATIVE_MINT,
      tokenMint: mintPk,
      payerWsolAccount: pk(meteoraAccounts.payerWsolAccount),
      payerTokenAccount: pk(meteoraAccounts.payerTokenAccount),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([positionNftMint])
    .preInstructions(COMPUTE_BUDGET_IXS)
    .rpc();
}

export async function migratePresale(wallet, mint, meteoraAccounts = {}) {
  requireMeteoraAccounts(meteoraAccounts);
  const program = getProgram(wallet);
  const mintPk = pk(mint);
  const poolPda = getPresalePoolPda(mintPk);
  const config = await program.account.globalConfig.fetch(getConfigPda());
  const pool = await program.account.presalePool.fetch(poolPda);
  const positionNftMint = meteoraAccounts.positionNftMintKeypair || Keypair.generate();

  return program.methods
    .migratePresale()
    .accounts({
      payer: wallet.publicKey,
      config: getConfigPda(),
      pool: poolPda,
      solVault: getPresaleSolVaultPda(mintPk),
      tokenVault: getPresaleTokenVaultPda(mintPk),
      buybackState: getBuybackStatePda(poolPda),
      buybackTokenVault: getBuybackTokenVaultPda(poolPda),
      platformWallet: config.platformWallet,
      creatorWallet: pool.creator,
      meteoraProgram: METEORA_PROGRAM_ID,
      meteoraPool: pk(meteoraAccounts.meteoraPool),
      meteoraPoolConfig: pk(meteoraAccounts.meteoraPoolConfig),
      meteoraPoolAuthority: pk(meteoraAccounts.meteoraPoolAuthority),
      token2022Program: TOKEN_2022_PROGRAM_ID,
      meteoraEventAuthority: meteoraAccounts.meteoraEventAuthority ? pk(meteoraAccounts.meteoraEventAuthority) : getMeteoraEventAuthorityPda(),
      lpCustody: getLpCustodyPda(poolPda),
      positionNftMint: positionNftMint.publicKey,
      positionNftAccount: pk(meteoraAccounts.positionNftAccount),
      positionAccount: pk(meteoraAccounts.positionAccount),
      meteoraVaultA: pk(meteoraAccounts.meteoraVaultA),
      meteoraVaultB: pk(meteoraAccounts.meteoraVaultB),
      meteoraTokenABadge: pk(meteoraAccounts.meteoraTokenABadge),
      meteoraTokenBBadge: pk(meteoraAccounts.meteoraTokenBBadge),
      wsolMint: NATIVE_MINT,
      tokenMint: mintPk,
      payerWsolAccount: pk(meteoraAccounts.payerWsolAccount),
      payerTokenAccount: pk(meteoraAccounts.payerTokenAccount),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([positionNftMint])
    .preInstructions(COMPUTE_BUDGET_IXS)
    .rpc();
}

export async function claimLpFees(wallet, pool, feeMint) {
  const program = getProgram(wallet);
  const poolPk = pk(pool);
  const feeMintPk = pk(feeMint);
  const buybackStatePda = getBuybackStatePda(poolPk);
  const buybackState = await program.account.buybackState.fetch(buybackStatePda);
  const config = await program.account.globalConfig.fetch(getConfigPda());
  const creator = await poolCreator(program, poolPk, buybackState.poolType);
  const creatorAta = await ataIx(feeMintPk, creator, wallet.publicKey);
  const protocolAta = await ataIx(feeMintPk, config.platformWallet, wallet.publicKey);
  const keeperAta = await ataIx(feeMintPk, config.keeperWallet, wallet.publicKey);

  return program.methods
    .claimLpFees()
    .accounts({
      payer: wallet.publicKey,
      config: getConfigPda(),
      buybackState: buybackStatePda,
      lpFeeVault: getLpFeeVaultPda(poolPk, feeMintPk),
      creatorWallet: creator,
      protocolWallet: config.platformWallet,
      pool: poolPk,
      creatorFeeAccount: creatorAta.address,
      protocolFeeAccount: protocolAta.address,
      keeperFeeAccount: keeperAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([creatorAta.instruction, protocolAta.instruction, keeperAta.instruction])
    .rpc();
}

async function poolCreator(program, pool, poolType) {
  const fetched = Number(poolType) === 1
    ? await program.account.presalePool.fetch(pool)
    : await program.account.bondingCurvePool.fetch(pool);
  return fetched.creator;
}

// ── Pool data ────────────────────────────────────────────────────────────

export async function getPoolData(wallet, mint, mode = 'bonding') {
  const program = getProgram(wallet);
  const mintPk = pk(mint);
  try {
    if (mode === 'presale') return await program.account.presalePool.fetch(getPresalePoolPda(mintPk));
    return await program.account.bondingCurvePool.fetch(getBondingPoolPda(mintPk));
  } catch {
    return null;
  }
}
