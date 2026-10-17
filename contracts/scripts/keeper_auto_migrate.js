const anchor = require("@coral-xyz/anchor");
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} = require("@solana/web3.js");
const {
  CP_AMM_PROGRAM_ID,
  derivePoolAddress,
  derivePoolAuthority,
  derivePositionAddress,
  derivePositionNftAccount,
  deriveTokenBadgeAddress,
  deriveTokenVaultAddress,
} = require("@meteora-ag/cp-amm-sdk");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PROGRAM_ID = new PublicKey(
  process.env.LAUNCHPAD_PROGRAM_ID || "2coG61UUvuEscPVsdrWY4Vj4E1QYMstajAuhXs5nsH3s"
);
const RPC_URL = process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const METEORA_POOL_CONFIG = new PublicKey(
  process.env.METEORA_POOL_CONFIG || "3KLdspUofc75aaEAJdBo1o6D6cyzXJVtGB8PgpWJEiaR"
);
const STATE_FILE = process.env.MIGRATION_STATE_FILE || path.join(__dirname, "..", ".keeper-migrations.json");
const MODE = process.env.KEEPER_MODE || process.env.WORKER_MODE || "once";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || "30000");
const MAX_POOLS_PER_TICK = Number(process.env.MAX_POOLS_PER_TICK || "0");
const MAX_RETRIES = Number(process.env.MAX_RETRIES || "8");
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS || "30000");
const LOCK_TTL_MS = Number(process.env.LOCK_TTL_MS || "600000");
const DRY_RUN = process.env.DRY_RUN === "1";
const MINT_FILTER = process.env.MINT ? new PublicKey(process.env.MINT) : null;
const POOL_TYPE_FILTER = process.env.POOL_TYPE || "all";

function log(level, event, fields = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadIdl() {
  const idlPath = path.join(__dirname, "..", "target", "idl", "launchpad.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  idl.address = PROGRAM_ID.toBase58();
  idl.metadata = { ...(idl.metadata || {}), address: PROGRAM_ID.toBase58() };
  const typesByName = new Map((idl.types || []).map((typeDef) => [typeDef.name, typeDef]));
  idl.accounts = (idl.accounts || []).map((account) => {
    if (account.type) return account;
    const typeDef = typesByName.get(account.name);
    return typeDef ? { ...account, type: typeDef.type } : account;
  });
  return idl;
}

function parseKeeperKeypair() {
  const raw = process.env.KEEPER_PRIVATE_KEY || process.env.ANCHOR_WALLET;
  if (!raw) {
    if (DRY_RUN) {
      log("warn", "keeper_dry_run_ephemeral_wallet", {
        reason: "No KEEPER_PRIVATE_KEY or ANCHOR_WALLET set; generated a temporary read-only dry-run wallet",
      });
      return Keypair.generate();
    }
    throw new Error("Set KEEPER_PRIVATE_KEY to a JSON secret-key array/base58 secret, or ANCHOR_WALLET to a keypair file path");
  }

  if (raw.trim().startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }

  const expanded = raw.startsWith("~/") ? path.join(os.homedir(), raw.slice(2)) : raw;
  if (fs.existsSync(expanded)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(expanded, "utf8"))));
  }

  return Keypair.fromSecretKey(anchor.utils.bytes.bs58.decode(raw));
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { version: 1, migrations: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function stateEntry(state, pool) {
  const key = pool.toBase58();
  state.migrations[key] ||= { attempts: 0 };
  return state.migrations[key];
}

function isLocked(entry, now = Date.now()) {
  return entry.status === "in_progress" && entry.lockedAt && now - entry.lockedAt < LOCK_TTL_MS;
}

function canRetry(entry, now = Date.now()) {
  if (entry.status === "migrated" || isLocked(entry, now)) return false;
  if (entry.nextRetryAt && now < entry.nextRetryAt) return false;
  return (entry.attempts || 0) < MAX_RETRIES;
}

function bnGte(left, right) {
  return new anchor.BN(left).gte(new anchor.BN(right));
}

function toStr(value) {
  return value?.toString ? value.toString() : String(value);
}

function solscan(signature) {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

function deriveMigrationAccounts({ poolPda, mint }) {
  const positionNftMint = Keypair.generate();
  const meteoraPool = derivePoolAddress(METEORA_POOL_CONFIG, NATIVE_MINT, mint);

  return {
    positionNftMint,
    meteoraPool,
    meteoraPoolConfig: METEORA_POOL_CONFIG,
    meteoraPoolAuthority: derivePoolAuthority(),
    meteoraEventAuthority: PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      CP_AMM_PROGRAM_ID
    )[0],
    lpCustody: PublicKey.findProgramAddressSync(
      [Buffer.from("lp_custody"), poolPda.toBuffer()],
      PROGRAM_ID
    )[0],
    positionNftAccount: derivePositionNftAccount(positionNftMint.publicKey),
    positionAccount: derivePositionAddress(positionNftMint.publicKey),
    meteoraVaultA: deriveTokenVaultAddress(NATIVE_MINT, meteoraPool),
    meteoraVaultB: deriveTokenVaultAddress(mint, meteoraPool),
    meteoraTokenABadge: deriveTokenBadgeAddress(NATIVE_MINT),
    meteoraTokenBBadge: deriveTokenBadgeAddress(mint),
  };
}

function deriveBondingAccounts(mint) {
  const pool = PublicKey.findProgramAddressSync([Buffer.from("bonding_pool"), mint.toBuffer()], PROGRAM_ID)[0];
  return {
    pool,
    solVault: PublicKey.findProgramAddressSync([Buffer.from("bonding_sol_vault"), mint.toBuffer()], PROGRAM_ID)[0],
    tokenVault: PublicKey.findProgramAddressSync([Buffer.from("bonding_token_vault"), mint.toBuffer()], PROGRAM_ID)[0],
    buybackState: PublicKey.findProgramAddressSync([Buffer.from("buyback"), pool.toBuffer()], PROGRAM_ID)[0],
    buybackTokenVault: PublicKey.findProgramAddressSync([Buffer.from("buyback_token_vault"), pool.toBuffer()], PROGRAM_ID)[0],
  };
}

function derivePresaleAccounts(mint) {
  const pool = PublicKey.findProgramAddressSync([Buffer.from("presale_pool"), mint.toBuffer()], PROGRAM_ID)[0];
  return {
    pool,
    solVault: PublicKey.findProgramAddressSync([Buffer.from("presale_sol_vault"), mint.toBuffer()], PROGRAM_ID)[0],
    tokenVault: PublicKey.findProgramAddressSync([Buffer.from("presale_token_vault"), mint.toBuffer()], PROGRAM_ID)[0],
    buybackState: PublicKey.findProgramAddressSync([Buffer.from("buyback"), pool.toBuffer()], PROGRAM_ID)[0],
    buybackTokenVault: PublicKey.findProgramAddressSync([Buffer.from("buyback_token_vault"), pool.toBuffer()], PROGRAM_ID)[0],
  };
}

async function getPayerAtas(provider, mint) {
  const payerWsolAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,
    NATIVE_MINT,
    provider.wallet.publicKey
  );
  const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,
    mint,
    provider.wallet.publicKey
  );

  return { payerWsolAccount: payerWsolAccount.address, payerTokenAccount: payerTokenAccount.address };
}

async function confirmSignature(provider, signature) {
  const latest = await provider.connection.getLatestBlockhash("confirmed");
  const result = await provider.connection.confirmTransaction(
    { signature, ...latest },
    "confirmed"
  );
  if (result.value.err) {
    throw new Error(`Transaction failed confirmation: ${JSON.stringify(result.value.err)}`);
  }
}

async function fetchEligiblePools(program) {
  const jobs = [];

  if (POOL_TYPE_FILTER === "all" || POOL_TYPE_FILTER === "bonding") {
    const pools = await program.account.bondingCurvePool.all();
    for (const { publicKey, account } of pools) {
      if (MINT_FILTER && !account.mint.equals(MINT_FILTER)) continue;
      if (account.isMigrated) continue;
      if (!bnGte(account.realSolReserves, account.migrationTarget)) continue;
      jobs.push({
        type: "bonding",
        pool: publicKey,
        mint: account.mint,
        raised: account.realSolReserves,
        target: account.migrationTarget,
      });
    }
  }

  if (POOL_TYPE_FILTER === "all" || POOL_TYPE_FILTER === "presale") {
    const pools = await program.account.presalePool.all();
    for (const { publicKey, account } of pools) {
      if (MINT_FILTER && !account.mint.equals(MINT_FILTER)) continue;
      if (account.isMigrated) continue;
      if (!bnGte(account.currentRaised, account.migrationTarget)) continue;
      jobs.push({
        type: "presale",
        pool: publicKey,
        mint: account.mint,
        creator: account.creator,
        raised: account.currentRaised,
        target: account.migrationTarget,
      });
    }
  }

  return MAX_POOLS_PER_TICK > 0 ? jobs.slice(0, MAX_POOLS_PER_TICK) : jobs;
}

async function migrateBonding({ program, provider, config, job }) {
  const accounts = deriveBondingAccounts(job.mint);
  const meteora = deriveMigrationAccounts({ poolPda: accounts.pool, mint: job.mint });

  if (DRY_RUN) return { dryRun: true, meteoraPool: meteora.meteoraPool };

  const payerAtas = await getPayerAtas(provider, job.mint);

  const signature = await program.methods
    .migrateBonding()
    .accounts({
      payer: provider.wallet.publicKey,
      config: config.pda,
      pool: accounts.pool,
      solVault: accounts.solVault,
      tokenVault: accounts.tokenVault,
      buybackState: accounts.buybackState,
      buybackTokenVault: accounts.buybackTokenVault,
      platformWallet: config.account.platformWallet,
      meteoraProgram: CP_AMM_PROGRAM_ID,
      meteoraPool: meteora.meteoraPool,
      meteoraPoolConfig: meteora.meteoraPoolConfig,
      meteoraPoolAuthority: meteora.meteoraPoolAuthority,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      meteoraEventAuthority: meteora.meteoraEventAuthority,
      lpCustody: meteora.lpCustody,
      positionNftMint: meteora.positionNftMint.publicKey,
      positionNftAccount: meteora.positionNftAccount,
      positionAccount: meteora.positionAccount,
      meteoraVaultA: meteora.meteoraVaultA,
      meteoraVaultB: meteora.meteoraVaultB,
      meteoraTokenABadge: meteora.meteoraTokenABadge,
      meteoraTokenBBadge: meteora.meteoraTokenBBadge,
      wsolMint: NATIVE_MINT,
      tokenMint: job.mint,
      payerWsolAccount: payerAtas.payerWsolAccount,
      payerTokenAccount: payerAtas.payerTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([meteora.positionNftMint])
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
    ])
    .rpc();

  await confirmSignature(provider, signature);
  return { signature, meteoraPool: meteora.meteoraPool };
}

async function migratePresale({ program, provider, config, job }) {
  const accounts = derivePresaleAccounts(job.mint);
  const meteora = deriveMigrationAccounts({ poolPda: accounts.pool, mint: job.mint });

  if (DRY_RUN) return { dryRun: true, meteoraPool: meteora.meteoraPool };

  const payerAtas = await getPayerAtas(provider, job.mint);

  const signature = await program.methods
    .migratePresale()
    .accounts({
      payer: provider.wallet.publicKey,
      config: config.pda,
      pool: accounts.pool,
      solVault: accounts.solVault,
      tokenVault: accounts.tokenVault,
      buybackState: accounts.buybackState,
      buybackTokenVault: accounts.buybackTokenVault,
      platformWallet: config.account.platformWallet,
      creatorWallet: job.creator,
      meteoraProgram: CP_AMM_PROGRAM_ID,
      meteoraPool: meteora.meteoraPool,
      meteoraPoolConfig: meteora.meteoraPoolConfig,
      meteoraPoolAuthority: meteora.meteoraPoolAuthority,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      meteoraEventAuthority: meteora.meteoraEventAuthority,
      lpCustody: meteora.lpCustody,
      positionNftMint: meteora.positionNftMint.publicKey,
      positionNftAccount: meteora.positionNftAccount,
      positionAccount: meteora.positionAccount,
      meteoraVaultA: meteora.meteoraVaultA,
      meteoraVaultB: meteora.meteoraVaultB,
      meteoraTokenABadge: meteora.meteoraTokenABadge,
      meteoraTokenBBadge: meteora.meteoraTokenBBadge,
      wsolMint: NATIVE_MINT,
      tokenMint: job.mint,
      payerWsolAccount: payerAtas.payerWsolAccount,
      payerTokenAccount: payerAtas.payerTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([meteora.positionNftMint])
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
    ])
    .rpc();

  await confirmSignature(provider, signature);
  return { signature, meteoraPool: meteora.meteoraPool };
}

async function processJob({ program, provider, config, state, job }) {
  const entry = stateEntry(state, job.pool);
  const pool = job.pool.toBase58();
  const mint = job.mint.toBase58();
  const now = Date.now();

  if (entry.status === "migrated") {
    log("info", "migration_skip_state_migrated", { type: job.type, pool, mint });
    return;
  }
  if (isLocked(entry, now)) {
    log("info", "migration_skip_in_progress", { type: job.type, pool, mint, lockedAt: entry.lockedAt });
    return;
  }
  if (!canRetry(entry, now)) {
    log("warn", "migration_skip_retry_backoff", {
      type: job.type,
      pool,
      mint,
      attempts: entry.attempts || 0,
      nextRetryAt: entry.nextRetryAt || null,
    });
    return;
  }

  entry.status = "in_progress";
  entry.lockedAt = now;
  entry.attempts = (entry.attempts || 0) + 1;
  saveState(state);

  log("info", "migration_attempt", {
    type: job.type,
    pool,
    mint,
    raised: toStr(job.raised),
    target: toStr(job.target),
    attempt: entry.attempts,
  });

  try {
    const result = job.type === "bonding"
      ? await migrateBonding({ program, provider, config, job })
      : await migratePresale({ program, provider, config, job });

    entry.status = DRY_RUN ? "dry_run" : "migrated";
    entry.lockedAt = null;
    entry.signature = result.signature || null;
    entry.meteoraPool = result.meteoraPool.toBase58();
    entry.completedAt = Date.now();
    entry.lastError = null;
    saveState(state);

    log("info", DRY_RUN ? "migration_dry_run_success" : "migration_success", {
      type: job.type,
      pool,
      mint,
      signature: result.signature || null,
      solscan: result.signature ? solscan(result.signature) : null,
      meteoraPool: result.meteoraPool.toBase58(),
    });
  } catch (err) {
    const delay = RETRY_BASE_MS * Math.pow(2, Math.max(0, entry.attempts - 1));
    entry.status = "retry";
    entry.lockedAt = null;
    entry.lastError = err.message;
    entry.nextRetryAt = Date.now() + delay;
    saveState(state);

    log("error", "migration_failure", {
      type: job.type,
      pool,
      mint,
      attempts: entry.attempts,
      nextRetryAt: entry.nextRetryAt,
      error: err.message,
      logs: err.logs || undefined,
    });
  }
}

async function runOnce({ program, provider, state }) {
  const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];
  const config = {
    pda: configPda,
    account: await program.account.globalConfig.fetch(configPda),
  };
  const jobs = await fetchEligiblePools(program);

  log("info", "scan_complete", {
    eligiblePools: jobs.length,
    dryRun: DRY_RUN,
    poolTypeFilter: POOL_TYPE_FILTER,
    mintFilter: MINT_FILTER?.toBase58() || null,
  });

  for (const job of jobs) {
    await processJob({ program, provider, config, state, job });
  }
}

async function main() {
  const payer = parseKeeperKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new anchor.Program(loadIdl(), provider);
  const state = loadState();

  log("info", "keeper_start", {
    mode: MODE,
    rpcUrl: RPC_URL.replace(/api-key=[^&]+/, "api-key=***"),
    programId: PROGRAM_ID.toBase58(),
    keeper: provider.wallet.publicKey.toBase58(),
    meteoraPoolConfig: METEORA_POOL_CONFIG.toBase58(),
    stateFile: STATE_FILE,
    dryRun: DRY_RUN,
  });

  if (MODE === "loop" || MODE === "worker") {
    while (true) {
      try {
        await runOnce({ program, provider, state });
      } catch (err) {
        log("error", "scan_failure", { error: err.message, logs: err.logs || undefined });
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  await runOnce({ program, provider, state });
}

main().catch((err) => {
  log("error", "keeper_fatal", { error: err.message, logs: err.logs || undefined });
  process.exit(1);
});
