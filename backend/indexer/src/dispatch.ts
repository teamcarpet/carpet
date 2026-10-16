// ─────────────────────────────────────────────────────────────────────────
// Decoded program events → handlers. Shared by every stream source (gRPC,
// RPC logs, backfill), so the same transaction always yields the same rows.
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { logger } from '@carpet/shared';
import { decodeEvents, loadIdl } from './decoder.js';
import { fetchTokenMetadata } from './metadata.js';
import { handlePoolCreated } from './handlers/pool-created.js';
import { handleTrade } from './handlers/tokens-bought.js';
import { handleMigrationCompleted } from './handlers/migration.js';
import { handlePresaleContribution, handlePresaleClaim, handlePresaleRefund } from './handlers/presale.js';
import { handleBuyback } from './handlers/buyback.js';

export interface DispatchContext {
  redis:      Redis;
  connection: Connection;
  program:    anchor.Program;
}

export function createDispatchContext(redis: Redis, rpcUrl: string): DispatchContext {
  const connection = new Connection(rpcUrl, 'confirmed');
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(Keypair.generate()), { commitment: 'confirmed' });
  return { redis, connection, program: new anchor.Program(loadIdl(), provider) };
}

// ── Value helpers ────────────────────────────────────────────────────────
function pubkey(v: unknown): string {
  if (v instanceof PublicKey) return v.toBase58();
  if (typeof v === 'string') return v;
  if (v && typeof (v as any).toBase58 === 'function') return (v as any).toBase58();
  if (v instanceof Uint8Array && v.length === 32) {
    try { return new PublicKey(v).toBase58(); } catch {}
  }
  return String(v);
}

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(typeof v === 'object' ? (v as any).toString() : v);
  return Number.isNaN(n) ? 0 : n;
}

const sol = (lamports: unknown) => num(lamports) / 1e9;

// Anchor may hand back camelCase or snake_case depending on IDL shape.
const field = (data: Record<string, unknown>, camel: string, snake: string) => data[camel] ?? data[snake];

// ── Cached chain lookups ─────────────────────────────────────────────────
const mintInfo = new Map<string, { decimals: number; supply: number }>();
async function getMintInfo(ctx: DispatchContext, mint: string) {
  const cached = mintInfo.get(mint);
  if (cached) return cached;
  try {
    const { value } = await ctx.connection.getTokenSupply(new PublicKey(mint));
    const info = { decimals: value.decimals, supply: Number(value.uiAmountString ?? value.uiAmount ?? 1e9) };
    mintInfo.set(mint, info);
    return info;
  } catch {
    return { decimals: 6, supply: 1e9 };
  }
}

// Short-lived cache so a backfill burst of trades on one pool costs one RPC call.
const POOL_TTL_MS = 3000;
const poolCache = new Map<string, { at: number; value: { type: 'bonding' | 'presale'; account: any } }>();
async function fetchPool(ctx: DispatchContext, pool: string) {
  const hit = poolCache.get(pool);
  if (hit && Date.now() - hit.at < POOL_TTL_MS) return hit.value;
  const accounts = ctx.program.account as any;
  const pk = new PublicKey(pool);
  let value: { type: 'bonding' | 'presale'; account: any };
  try {
    value = { type: 'bonding', account: await accounts.bondingCurvePool.fetch(pk) };
  } catch {
    value = { type: 'presale', account: await accounts.presalePool.fetch(pk) };
  }
  poolCache.set(pool, { at: Date.now(), value });
  return value;
}

// ── Dispatch ─────────────────────────────────────────────────────────────
export async function dispatchLogs(
  ctx: DispatchContext,
  tx: { signature: string; slot: number; logs: string[] },
): Promise<number> {
  const events = decodeEvents(tx.logs);
  if (!events.length) return 0;
  logger.debug({ sig: tx.signature.slice(0, 16), events: events.map(e => e.name) }, 'tx decoded');

  for (const evt of events) {
    try {
      await dispatchEvent(ctx, tx.signature, tx.slot, evt.name, evt.data as Record<string, unknown>);
    } catch (err) {
      // One bad event must not drop the rest of the transaction.
      logger.error({ event: evt.name, sig: tx.signature.slice(0, 16), err: (err as Error).message }, 'event dispatch failed');
    }
  }
  return events.length;
}

async function dispatchEvent(ctx: DispatchContext, signature: string, slot: number, name: string, data: Record<string, unknown>) {
  switch (name) {
    case 'PoolCreated': {
      const mint = pubkey(data.mint);
      const [metadata, info] = await Promise.all([
        fetchTokenMetadata(ctx.connection, mint).catch(() => null),
        getMintInfo(ctx, mint),
      ]);
      await handlePoolCreated({
        pool:            pubkey(data.pool),
        mint,
        creator:         pubkey(data.creator),
        ticker:          metadata?.symbol || mint.slice(0, 4).toUpperCase(),
        name:            metadata?.name || `Token ${mint.slice(0, 6)}`,
        imageUrl:        metadata?.image ?? null,
        poolType:        num(field(data, 'poolType', 'pool_type')) === 1 ? 'presale' : 'bonding',
        migrationTarget: sol(field(data, 'migrationTarget', 'migration_target')),
        supply:          info.supply,
        metadata,
        timestamp:       num(data.timestamp),
        slot,
      }, ctx.redis);
      return;
    }

    case 'TokensBought':
    case 'TokensSold': {
      const pool = pubkey(data.pool);
      const snapshot = await fetchPool(ctx, pool);
      const acct = snapshot.account;
      const mint = pubkey(acct.mint);
      const { decimals, supply } = await getMintInfo(ctx, mint);
      const isBuy = name === 'TokensBought';

      // new_price = virtual_sol * 1e9 / virtual_tokens (both in base units),
      // i.e. the marginal curve price after this trade. SOL per whole token:
      const priceSol = num(field(data, 'newPrice', 'new_price')) * 10 ** decimals / 1e18;
      const migrationTarget = sol(acct.migrationTarget ?? acct.migration_target);
      const totalRaisedSol = sol(acct.realSolReserves ?? acct.real_sol_reserves ?? acct.currentRaised ?? 0);

      await handleTrade({
        signature,
        pool,
        mint,
        account:      pubkey(isBuy ? data.buyer : data.seller),
        side:         isBuy ? 'buy' : 'sell',
        amountSol:    sol(field(data, 'solAmount', 'sol_amount')),
        amountToken:  num(field(data, 'tokenAmount', 'token_amount')) / 10 ** decimals,
        priceUsd:     null,
        priceSol,
        feePlatform:  sol(field(data, 'platformFee', 'platform_fee')),
        feeCreator:   sol(field(data, 'creatorFee', 'creator_fee')),
        sellTax:      isBuy ? 0 : sol(field(data, 'sellTax', 'sell_tax')),
        timestamp:    num(data.timestamp),
        slot,
        totalRaisedSol,
        migrationTarget,
        progressPct:  migrationTarget > 0 ? Math.min(100, (totalRaisedSol / migrationTarget) * 100) : 0,
        reserveSol:   totalRaisedSol,
        reserveToken: num(acct.realTokenReserves ?? acct.real_token_reserves ?? 0) / 10 ** decimals,
        marketCap:    priceSol * supply,
      } as any, ctx.redis);
      return;
    }

    case 'PresaleContribution': {
      const pool = pubkey(data.pool);
      const snapshot = await fetchPool(ctx, pool);
      await handlePresaleContribution({
        pool,
        mint:           pubkey(snapshot.account.mint),
        contributor:    pubkey(data.contributor),
        amountSol:      sol(field(data, 'solAmount', 'sol_amount')),
        totalRaisedSol: sol(field(data, 'totalRaised', 'total_raised')),
        round:          0,
        timestamp:      num(data.timestamp),
      }, ctx.redis);
      return;
    }

    case 'PresaleClaimed':
    case 'PresaleRefunded': {
      const pool = pubkey(data.pool);
      const snapshot = await fetchPool(ctx, pool);
      const mint = pubkey(snapshot.account.mint);
      const evt = {
        pool,
        mint,
        account:   pubkey(data.user),
        amount:    name === 'PresaleClaimed'
          ? num(field(data, 'tokenAmount', 'token_amount')) / 10 ** (await getMintInfo(ctx, mint)).decimals
          : sol(field(data, 'solAmount', 'sol_amount')),
        timestamp: num(data.timestamp),
      };
      await (name === 'PresaleClaimed' ? handlePresaleClaim : handlePresaleRefund)(evt, ctx.redis);
      return;
    }

    case 'MigrationCompleted': {
      const pool = pubkey(data.pool);
      const snapshot = await fetchPool(ctx, pool);
      await handleMigrationCompleted({
        pool,
        mint:        pubkey(snapshot.account.mint),
        meteoraPool: pubkey(field(data, 'meteoraPool', 'meteora_pool')),
        reserveSol:  sol(field(data, 'liquiditySol', 'liquidity_sol')),
        timestamp:   num(data.timestamp),
        slot,
      }, ctx.redis);
      return;
    }

    case 'BuybackExecuted': {
      const pool = pubkey(data.pool);
      const snapshot = await fetchPool(ctx, pool);
      const mint = pubkey(snapshot.account.mint);
      const { decimals } = await getMintInfo(ctx, mint);
      await handleBuyback({
        signature,
        pool,
        mint,
        amountSolSpent:    sol(field(data, 'solSpent', 'sol_spent')),
        amountTokenBurned: num(field(data, 'tokensReceived', 'tokens_received')) / 10 ** decimals,
        roundNumber:       num(field(data, 'roundNumber', 'round_number')),
        totalRounds:       num(field(data, 'totalRounds', 'total_rounds')),
        timestamp:         num(data.timestamp),
        slot,
      }, ctx.redis);
      return;
    }

    default:
      // MigrationReady / ConfigUpdated carry nothing the API serves.
      return;
  }
}
