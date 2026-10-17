// ─────────────────────────────────────────────────────────────────────────
// GET /token/insights?mint=… — everything a buyer checks before aping:
//   creator   history on CARPET (launched / graduated / past tokens),
//             current holding, sold or not, fees earned, X handle reuse
//   safety    mint + freeze authority, max buy, sell tax, LP lock
//   holders   top wallets (program vaults excluded), top-10 share
//   snipers   wallets that bought within ~1s of launch and what they hold
//   bundles   slots where several wallets bought together
//   linked    wallets funded by the same source, or by/for the creator
//   buyback   sell-tax treasury and tokens burned
//
// Chain reads are cached; the funding-graph walk is the expensive part, so
// it runs in the background and the first response says `pending`.
// ─────────────────────────────────────────────────────────────────────────

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Connection, PublicKey, type ParsedAccountData } from '@solana/web3.js';
import { sql } from '@carpet/shared/db';
import { logger } from '@carpet/shared';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID ?? '2coG61UUvuEscPVsdrWY4Vj4E1QYMstajAuhXs5nsH3s');
const connection = new Connection(RPC_URL, 'confirmed');

const INSIGHTS_TTL_MS = 30_000;
const LINKED_TTL_MS = 10 * 60_000;
const SNIPER_WINDOW_SLOTS = 3;          // ≈1.2s after the first trade
const HUB_TX_THRESHOLD = 1000;          // funders this busy are exchanges/faucets, not links
const MAX_LINK_WALLETS = 16;

const querySchema = z.object({ mint: z.string().min(32).max(44) });

// ── Small helpers ────────────────────────────────────────────────────────
function cached<T>(ttl: number) {
  const store = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = load();
    store.set(key, { at: Date.now(), value });
    value.catch(() => store.delete(key));
    if (store.size > 500) store.delete(store.keys().next().value!);
    return value;
  };
}
const insightsCache = cached<object | null>(INSIGHTS_TTL_MS);
const linkedCache = new Map<string, { at: number; status: 'pending' | 'ready'; value?: LinkedResult }>();

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const isPda = (address: string) => !PublicKey.isOnCurve(new PublicKey(address).toBytes());

// ── Chain reads ──────────────────────────────────────────────────────────
async function readMint(mint: PublicKey) {
  const info = await connection.getParsedAccountInfo(mint);
  const parsed = (info.value?.data as ParsedAccountData | undefined)?.parsed?.info;
  return {
    decimals: Number(parsed?.decimals ?? 6),
    supply: Number(parsed?.supply ?? 0) / 10 ** Number(parsed?.decimals ?? 6),
    mintAuthority: parsed?.mintAuthority ?? null,
    freezeAuthority: parsed?.freezeAuthority ?? null,
  };
}

// BondingCurvePool: disc(8) creator(32) mint(32) vsr vtr real_sol real_tok init target (u64 each)
//                   max_buy_bps u16 @120, buyback_treasury u64 @122, is_migrated u8 @130
async function readBondingPool(mint: PublicKey) {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('bonding_pool'), mint.toBuffer()], PROGRAM_ID);
  const info = await connection.getAccountInfo(pda);
  if (!info || info.data.length < 131) return null;
  const d = info.data;
  return {
    realSol: Number(d.readBigUInt64LE(88)) / 1e9,
    targetSol: Number(d.readBigUInt64LE(112)) / 1e9,
    maxBuyBps: d.readUInt16LE(120),
    buybackTreasurySol: Number(d.readBigUInt64LE(122)) / 1e9,
    isMigrated: d[130] === 1,
  };
}

// GlobalConfig: disc(8) admin pause dev platform (32 each) → dev_fee @136, platform_fee @138, sell_tax @140
const readConfig = (() => {
  let memo: Promise<{ sellTaxBps: number; buyFeeBps: number } | null> | null = null;
  return () => (memo ??= (async () => {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
    const info = await connection.getAccountInfo(pda);
    if (!info || info.data.length < 142) return null;
    return { buyFeeBps: info.data.readUInt16LE(136) + info.data.readUInt16LE(138), sellTaxBps: info.data.readUInt16LE(140) };
  })().catch(() => { memo = null; return null; }));
})();

interface Holder { owner: string; amount: number; pct: number; isProgram: boolean }

async function readTopHolders(mint: PublicKey, supply: number): Promise<Holder[]> {
  const largest = await connection.getTokenLargestAccounts(mint);
  const accounts = largest.value.filter(a => Number(a.uiAmount ?? 0) > 0);
  if (!accounts.length) return [];
  const infos = await connection.getMultipleParsedAccounts(accounts.map(a => a.address));
  const byOwner = new Map<string, Holder>();
  accounts.forEach((a, i) => {
    const owner = (infos.value[i]?.data as ParsedAccountData | undefined)?.parsed?.info?.owner as string | undefined;
    if (!owner) return;
    const prev = byOwner.get(owner);
    const amount = (prev?.amount ?? 0) + Number(a.uiAmount ?? 0);
    byOwner.set(owner, { owner, amount, pct: pct(amount, supply), isProgram: isPda(owner) });
  });
  return [...byOwner.values()].sort((a, b) => b.amount - a.amount);
}

async function balanceOf(owner: string, mint: PublicKey): Promise<number> {
  const res = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint });
  return res.value.reduce((s, a) => s + Number((a.account.data as ParsedAccountData).parsed?.info?.tokenAmount?.uiAmount ?? 0), 0);
}

// ── Funding graph ────────────────────────────────────────────────────────
interface LinkedCluster { funder: string; wallets: string[]; pct: number; viaCreator: boolean }
interface LinkedResult { clusters: LinkedCluster[]; linkedPct: number; linkedToCreatorPct: number; checked: number }

// Who sent this wallet its first SOL? Looks at the oldest transactions for
// the first one where the wallet's balance went up, and takes the account
// whose balance dropped the most in it — works for plain transfers, CEX
// withdrawals and faucet airdrops alike. Long-lived wallets (1000+ txs) aren't
// fresh sniper wallets, so they're skipped instead of paged through.
async function firstFunder(wallet: string): Promise<string | null> {
  const sigs = await connection.getSignaturesForAddress(new PublicKey(wallet), { limit: 1000 });
  if (!sigs.length || sigs.length >= 1000) return null;
  for (const info of sigs.slice(-3).reverse()) {
    const tx = await connection.getParsedTransaction(info.signature, { maxSupportedTransactionVersion: 0 });
    const keys = tx?.transaction.message.accountKeys.map(k => k.pubkey.toBase58()) ?? [];
    const pre = tx?.meta?.preBalances ?? [];
    const post = tx?.meta?.postBalances ?? [];
    const self = keys.indexOf(wallet);
    if (self < 0 || (post[self] ?? 0) <= (pre[self] ?? 0)) continue;
    let funder: string | null = null;
    let biggestDrop = 0;
    keys.forEach((k, i) => {
      const drop = (pre[i] ?? 0) - (post[i] ?? 0);
      if (k !== wallet && drop > biggestDrop) { biggestDrop = drop; funder = k; }
    });
    return funder;
  }
  return null;
}

async function isHub(address: string): Promise<boolean> {
  const sigs = await connection.getSignaturesForAddress(new PublicKey(address), { limit: HUB_TX_THRESHOLD });
  return sigs.length >= HUB_TX_THRESHOLD;
}

async function computeLinked(creator: string, wallets: Map<string, number>, supply: number): Promise<LinkedResult> {
  const list = [...wallets.keys()].slice(0, MAX_LINK_WALLETS);
  const funders = new Map<string, string | null>();
  for (const w of [...list, creator]) {
    try { funders.set(w, await firstFunder(w)); } catch { funders.set(w, null); }
  }
  const creatorFunder = funders.get(creator) ?? null;

  const groups = new Map<string, string[]>();
  for (const w of list) {
    const f = funders.get(w);
    if (!f) continue;
    // Funded by the creator, or by whoever funded the creator → creator's circle.
    const key = f === creator || (creatorFunder && f === creatorFunder) ? `creator:${creator}` : f;
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }

  const clusters: LinkedCluster[] = [];
  for (const [key, members] of groups) {
    const viaCreator = key.startsWith('creator:');
    if (!viaCreator && members.length < 2) continue;
    if (!viaCreator && await isHub(key).catch(() => true)) continue;   // CEX / faucet
    const held = members.reduce((s, w) => s + (wallets.get(w) ?? 0), 0);
    clusters.push({ funder: viaCreator ? creator : key, wallets: members, pct: pct(held, supply), viaCreator });
  }
  clusters.sort((a, b) => b.pct - a.pct);
  return {
    clusters,
    linkedPct: clusters.reduce((s, c) => s + c.pct, 0),
    linkedToCreatorPct: clusters.filter(c => c.viaCreator).reduce((s, c) => s + c.pct, 0),
    checked: list.length,
  };
}

function linkedFor(mint: string, creator: string, wallets: Map<string, number>, supply: number) {
  const hit = linkedCache.get(mint);
  if (hit && (hit.status === 'pending' || Date.now() - hit.at < LINKED_TTL_MS)) return hit;
  const entry = { at: Date.now(), status: 'pending' as 'pending' | 'ready', value: hit?.value };
  linkedCache.set(mint, entry);
  computeLinked(creator, wallets, supply)
    .then(value => linkedCache.set(mint, { at: Date.now(), status: 'ready', value }))
    .catch(err => { logger.warn({ mint: mint.slice(0, 8), err: (err as Error).message }, 'linked-wallet scan failed'); linkedCache.delete(mint); });
  return entry;
}

// ── Assembly ─────────────────────────────────────────────────────────────
async function buildInsights(mint: string) {
  const [token] = await sql`
    SELECT mint, creator, twitter, is_migrated AS "isMigrated", extract(epoch FROM created_at)::bigint AS "createdAt"
    FROM tokens WHERE mint = ${mint}
  `;
  if (!token) return null;
  const creator = token.creator as string;
  const mintPk = new PublicKey(mint);

  const [mintInfo, pool, config, creatorStats, pastTokens, devFlow, fees, twitterReuse, trades, burned] = await Promise.all([
    readMint(mintPk),
    readBondingPool(mintPk).catch(() => null),
    readConfig(),
    sql`SELECT count(*)::int AS launched, count(*) FILTER (WHERE is_migrated)::int AS graduated FROM tokens WHERE creator = ${creator}`,
    sql`
      SELECT mint, ticker, name, image_url AS "imageUrl", ath, is_migrated AS "isMigrated",
             extract(epoch FROM created_at)::bigint AS "createdAt"
      FROM tokens WHERE creator = ${creator} AND mint <> ${mint}
      ORDER BY created_at DESC LIMIT 8
    `,
    sql`
      SELECT coalesce(sum(amount_token) FILTER (WHERE side = 'buy'), 0)::float8  AS bought,
             coalesce(sum(amount_token) FILTER (WHERE side = 'sell'), 0)::float8 AS sold
      FROM trades WHERE mint = ${mint} AND account = ${creator}
    `,
    sql`SELECT coalesce(sum(fee_creator), 0)::float8 AS sol FROM trades WHERE mint = ${mint}`,
    token.twitter
      ? sql`SELECT count(*)::int AS n FROM tokens WHERE lower(twitter) = lower(${token.twitter}) AND mint <> ${mint}`
      : Promise.resolve([{ n: 0 }]),
    sql`SELECT account, side, amount_token AS amount, slot FROM trades WHERE mint = ${mint} ORDER BY timestamp ASC, slot ASC LIMIT 2000`,
    sql`SELECT coalesce(sum(tokens_burned), 0)::float8 AS tokens, coalesce(sum(sol_spent), 0)::float8 AS sol FROM buybacks WHERE mint = ${mint}`,
  ]);
  const supply = mintInfo.supply || 1;

  const holders = await readTopHolders(mintPk, supply).catch(() => [] as Holder[]);
  const wallets = holders.filter(h => !h.isProgram);
  const top10Pct = wallets.slice(0, 10).reduce((s, h) => s + h.pct, 0);

  const creatorHolder = holders.find(h => h.owner === creator);
  const creatorBalance = creatorHolder?.amount ?? await balanceOf(creator, mintPk).catch(() => 0);
  const bought = Number(devFlow[0]?.bought ?? 0);
  const sold = Number(devFlow[0]?.sold ?? 0);

  // Snipers: buyers (not the creator) in the first few slots of trading.
  const buys = trades.filter(t => t.side === 'buy');
  const firstSlot = buys.length ? Number(buys[0]!.slot) : null;
  const sniperSet = new Set<string>();
  if (firstSlot != null) {
    for (const t of buys) {
      if (Number(t.slot) > firstSlot + SNIPER_WINDOW_SLOTS) break;
      if (t.account !== creator) sniperSet.add(t.account as string);
    }
  }
  const holderByOwner = new Map(holders.map(h => [h.owner, h.amount]));
  const sniperHoldings = await Promise.all([...sniperSet].slice(0, 12).map(async w => [w, holderByOwner.get(w) ?? await balanceOf(w, mintPk).catch(() => 0)] as const));
  const sniperHeld = sniperHoldings.reduce((s, [, a]) => s + a, 0);

  // Bundles: slots where two or more different wallets bought.
  const bySlot = new Map<string, { wallets: Set<string>; amount: number }>();
  for (const t of buys) {
    const key = String(t.slot);
    const e = bySlot.get(key) ?? { wallets: new Set<string>(), amount: 0 };
    e.wallets.add(t.account as string);
    e.amount += Number(t.amount);
    bySlot.set(key, e);
  }
  const bundles = [...bySlot.values()].filter(e => e.wallets.size >= 2);
  const bundledTokens = bundles.reduce((s, e) => s + e.amount, 0);

  // Linked wallets: top holders + snipers, walked in the background.
  const linkTargets = new Map<string, number>();
  for (const h of wallets.slice(0, 12)) if (h.owner !== creator) linkTargets.set(h.owner, h.amount);
  for (const [w, a] of sniperHoldings) if (w !== creator && !linkTargets.has(w)) linkTargets.set(w, a);
  const linked = linkedFor(mint, creator, linkTargets, supply);

  const flags: string[] = [];
  if (bought > 0 && creatorBalance === 0) flags.push('creator_sold_all');
  else if (sold > 0) flags.push('creator_sold');
  if (top10Pct > 40) flags.push('top10_concentrated');
  if (pct(bundledTokens, supply) > 20) flags.push('heavy_bundles');
  if (pct(sniperHeld, supply) > 10) flags.push('snipers_holding');
  if ((linked.value?.linkedPct ?? 0) > 15) flags.push('linked_wallets');
  if (Number(twitterReuse[0]?.n ?? 0) > 0) flags.push('twitter_reused');
  if (mintInfo.mintAuthority || mintInfo.freezeAuthority) flags.push('authorities_live');
  if (pool && pool.maxBuyBps >= 10_000) flags.push('no_max_buy');

  return {
    mint,
    creator: {
      address: creator,
      launched: creatorStats[0]?.launched ?? 0,
      graduated: creatorStats[0]?.graduated ?? 0,
      pastTokens,
      holdingPct: pct(creatorBalance, supply),
      boughtTokens: bought,
      soldTokens: sold,
      status: bought > 0 && creatorBalance === 0 ? 'sold_all' : sold > 0 ? 'sold_some' : 'holding',
      feesEarnedSol: Number(fees[0]?.sol ?? 0),
      twitterReusedBy: Number(twitterReuse[0]?.n ?? 0),
    },
    safety: {
      mintRevoked: !mintInfo.mintAuthority,
      freezeRevoked: !mintInfo.freezeAuthority,
      maxBuyPct: pool ? pool.maxBuyBps / 100 : null,
      sellTaxPct: config ? config.sellTaxBps / 100 : null,
      buyFeePct: config ? config.buyFeeBps / 100 : null,
      lpLocked: Boolean(pool?.isMigrated ?? token.isMigrated),
      graduated: Boolean(pool?.isMigrated ?? token.isMigrated),
    },
    holders: {
      top: wallets.slice(0, 10).map(h => ({ owner: h.owner, pct: h.pct, isCreator: h.owner === creator, isSniper: sniperSet.has(h.owner) })),
      top10Pct,
      programHeldPct: holders.filter(h => h.isProgram).reduce((s, h) => s + h.pct, 0),
    },
    snipers: { wallets: sniperSet.size, holdingPct: pct(sniperHeld, supply) },
    bundles: { groups: bundles.length, wallets: bundles.reduce((s, e) => s + e.wallets.size, 0), boughtPct: pct(bundledTokens, supply) },
    linked: { status: linked.status, ...(linked.value ?? { clusters: [], linkedPct: 0, linkedToCreatorPct: 0, checked: 0 }) },
    buyback: {
      treasurySol: pool?.buybackTreasurySol ?? 0,
      burnedTokens: Number(burned[0]?.tokens ?? 0),
      burnedPct: pct(Number(burned[0]?.tokens ?? 0), supply),
      spentSol: Number(burned[0]?.sol ?? 0),
    },
    flags,
  };
}

export const insightsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/token/insights', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid query', issues: parsed.error.issues };
    }
    const { mint } = parsed.data;
    // Keyed by the linked-scan state, so a finished scan isn't hidden behind
    // a cached "pending" response.
    const scan = linkedCache.get(mint);
    const data = await insightsCache(`${mint}:${scan?.status}:${scan?.at}`, () => buildInsights(mint));
    if (!data) {
      reply.code(404);
      return { error: 'Token not indexed yet' };
    }
    reply.header('Cache-Control', 'no-store');
    return data;
  });
};
