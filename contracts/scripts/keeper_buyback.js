// Keeper loop: runs buyback-and-burn for every graduated token whose next
// round is due. Mirrors the program's gating so it only sends transactions
// that can succeed:
//   bonding  — 1% of the starting treasury, at least 10 slots apart
//   presale  — balance / rounds_left, every 4 h (Regular) or 30 min (Extreme)
// min_tokens_out is quoted from the Meteora vault balances minus SLIPPAGE_BPS,
// so a sandwiched or stale swap reverts instead of overpaying.
//
// Env: ANCHOR_PROVIDER_URL, ANCHOR_WALLET (keeper keypair), POLL_INTERVAL_MS,
//      SLIPPAGE_BPS (default 1000 = 10%), KEEPER_MODE=loop|once
const anchor = require("@coral-xyz/anchor");
const { getAccount, getOrCreateAssociatedTokenAccount, NATIVE_MINT, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { ComputeBudgetProgram, PublicKey, SystemProgram } = require("@solana/web3.js");
const { CP_AMM_PROGRAM_ID, derivePoolAuthority, deriveTokenVaultAddress } = require("@meteora-ag/cp-amm-sdk");
const idl = require("../target/idl/launchpad.json");

const MODE = process.env.KEEPER_MODE || "loop";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || "15000");
const SLIPPAGE_BPS = BigInt(process.env.SLIPPAGE_BPS || "1000");
const BONDING_BUYBACK_BPS = 100n;
const MIN_BUYBACK_INTERVAL_SLOTS = 10;
const ROUND_GRACE_SECONDS = 30;

const log = (level, event, fields = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const big = (bn) => BigInt(bn.toString());

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = new anchor.Program(idl, provider);
const conn = provider.connection;
const keeper = provider.wallet;
const eventAuthority = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], CP_AMM_PROGRAM_ID)[0];
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, program.programId)[0];

// Same arithmetic as execute_buyback.rs.
function spendFor(b) {
  const balance = big(b.treasuryBalance);
  if (b.poolType === 0) {
    const slice = (big(b.initialTreasury) * BONDING_BUYBACK_BPS) / 10000n;
    return slice < balance ? slice : balance;
  }
  const left = BigInt(b.totalRounds - b.roundsExecuted);
  return left > 0n ? balance / left : 0n;
}

function isDue(b, slot, now) {
  if (big(b.treasuryBalance) === 0n) return false;
  if (b.poolType === 0) {
    return Number(b.lastBuybackSlot) === 0 || slot >= Number(b.lastBuybackSlot) + MIN_BUYBACK_INTERVAL_SLOTS;
  }
  if (b.roundsExecuted >= b.totalRounds) return false;
  const last = Number(b.lastBuybackTs);
  return last === 0 || now + ROUND_GRACE_SECONDS >= last + Number(b.roundIntervalSeconds);
}

async function quoteMinOut(inputVault, outputVault, solIn) {
  const [x, y] = await Promise.all([getAccount(conn, inputVault), getAccount(conn, outputVault)]);
  const rx = big(x.amount), ry = big(y.amount);
  if (rx === 0n || ry === 0n) return 0n;
  const out = (ry * solIn) / (rx + solIn);
  return (out * (10000n - SLIPPAGE_BPS)) / 10000n;
}

async function runBuyback(acct) {
  const b = acct.account;
  const mint = b.mint;
  const solVault = b.poolType === 0 ? pda(Buffer.from("bonding_sol_vault"), mint.toBuffer()) : pda(Buffer.from("presale_sol_vault"), mint.toBuffer());
  const inputVault = deriveTokenVaultAddress(NATIVE_MINT, b.meteoraPool);
  const outputVault = deriveTokenVaultAddress(mint, b.meteoraPool);
  const spend = spendFor(b);
  if (spend === 0n) return;
  const minOut = await quoteMinOut(inputVault, outputVault, spend);
  if (minOut === 0n) { log("warn", "buyback_skip_empty_pool", { mint: mint.toBase58() }); return; }

  const wsol = await getOrCreateAssociatedTokenAccount(conn, keeper.payer, NATIVE_MINT, keeper.publicKey);
  const sig = await program.methods
    .executeBuyback({ mode: { burn: {} }, minTokensOut: new anchor.BN(minOut.toString()) })
    .accounts({
      payer: keeper.publicKey,
      buybackState: acct.publicKey,
      buybackSolVault: solVault,
      poolMint: mint,
      buybackTokenVault: pda(Buffer.from("buyback_token_vault"), b.pool.toBuffer()),
      tokenMint: mint,
      meteoraProgram: CP_AMM_PROGRAM_ID,
      meteoraPool: b.meteoraPool,
      meteoraPoolAuthority: derivePoolAuthority(),
      meteoraInputVault: inputVault,
      meteoraOutputVault: outputVault,
      wsolMint: NATIVE_MINT,
      payerWsolAccount: wsol.address,
      meteoraEventAuthority: eventAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
    ])
    .rpc();
  log("info", "buyback_executed", { mint: mint.toBase58(), poolType: b.poolType, solSpent: spend.toString(), minTokensOut: minOut.toString(), sig });
}

async function tick() {
  const [all, slot] = await Promise.all([program.account.buybackState.all(), conn.getSlot()]);
  const now = Math.floor(Date.now() / 1000);
  const due = all.filter((a) => isDue(a.account, slot, now));
  for (const a of due) {
    try {
      await runBuyback(a);
    } catch (err) {
      // Not activated yet, slippage, cooldown race — try again next tick.
      log("warn", "buyback_failed", { mint: a.account.mint.toBase58(), error: String(err.message || err).slice(0, 300) });
    }
  }
  return { tracked: all.length, due: due.length };
}

(async () => {
  log("info", "keeper_buyback_start", { keeper: keeper.publicKey.toBase58(), program: program.programId.toBase58(), mode: MODE });
  do {
    try {
      const r = await tick();
      if (r.due) log("info", "tick", r);
    } catch (err) {
      log("error", "tick_failed", { error: String(err.message || err).slice(0, 300) });
    }
    if (MODE === "loop") await sleep(POLL_INTERVAL_MS);
  } while (MODE === "loop");
})();
