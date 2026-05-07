// ─────────────────────────────────────────────────────────────────────────
// Handles tokens_bought and tokens_sold events (and mock equivalents).
//
// 1. Inserts the trade into the trades hypertable
// 2. Updates pool_state with latest price/reserves
// 3. Publishes to Redis CHANNELS.TRADE for the WS service to broadcast
//
// Idempotent: re-inserting the same (signature, mint) is a no-op thanks
// to the composite primary key + ON CONFLICT DO NOTHING.
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import { sql } from '@carpet/shared/db';
import { CHANNELS, publish, logger } from '@carpet/shared';
import type { Candle, Resolution, Trade } from '@carpet/shared/types';

export async function handleTrade(trade: Trade, redis: Redis): Promise<void> {
  const state = trade as Trade & {
    totalRaisedSol?: number;
    migrationTarget?: number;
    progressPct?: number;
    reserveSol?: number;
    reserveToken?: number;
    marketCap?: number;
  };
// 1. Insert trade. ON CONFLICT keeps re-runs idempotent.
  // PK is (signature, mint, timestamp) — must match in ON CONFLICT.
  // Date → ISO string for postgres.js timestamptz handling.
  const ts = new Date(trade.timestamp * 1000).toISOString();
  await sql`
    INSERT INTO trades (
      signature, mint, pool, account, side,
      amount_sol, amount_token, price_usd, price_sol,
      fee_platform, fee_creator, sell_tax,
      timestamp, slot
    ) VALUES (
      ${trade.signature}, ${trade.mint}, ${trade.pool}, ${trade.account}, ${trade.side},
      ${trade.amountSol}, ${trade.amountToken}, ${trade.priceUsd}, ${trade.priceSol},
      ${trade.feePlatform}, ${trade.feeCreator}, ${trade.sellTax},
      ${ts}, ${trade.slot}
    )
    ON CONFLICT (signature, mint, timestamp) DO NOTHING
  `;

  // 2. Update pool_state — last-write-wins is fine here, the indexer is single-process.
  await sql`
    INSERT INTO pool_state (pool, mint, price_sol, last_updated)
    VALUES (
      ${trade.pool},
      ${trade.mint},
      ${trade.priceSol},
      NOW()
    )
    ON CONFLICT (pool) DO UPDATE SET
      price_sol    = EXCLUDED.price_sol,
      total_raised_sol = COALESCE(${state.totalRaisedSol ?? null}, pool_state.total_raised_sol),
      migration_target = COALESCE(${state.migrationTarget ?? null}, pool_state.migration_target),
      progress_pct = COALESCE(${state.progressPct ?? null}, pool_state.progress_pct),
      reserve_sol = COALESCE(${state.reserveSol ?? null}, pool_state.reserve_sol),
      reserve_token = COALESCE(${state.reserveToken ?? null}, pool_state.reserve_token),
      market_cap = COALESCE(${state.marketCap ?? null}, pool_state.market_cap),
      last_updated = NOW()
  `;

  if (state.marketCap != null) {
    await sql`
      UPDATE tokens
      SET ath = GREATEST(ath, ${state.marketCap})
      WHERE mint = ${trade.mint}
    `;
  }

  // 3. Broadcast for the WS service
  await publish(redis, CHANNELS.TRADE, trade);
  await publishCurrentCandles(trade, redis);

  logger.debug({ side: trade.side, mint: trade.mint.slice(0, 8), sol: trade.amountSol }, 'trade');
}

async function publishCurrentCandles(trade: Trade, redis: Redis): Promise<void> {
  const resolutions: Resolution[] = ['1', '5', '15', '60', '240', 'D'];
  for (const resolution of resolutions) {
    const bucketStart = getBucketStart(trade.timestamp, resolution);
    const bucketEnd = getBucketEnd(bucketStart, resolution);
    const rows = await sql`
      SELECT price_sol AS price, amount_token AS volume
      FROM trades
      WHERE mint = ${trade.mint}
        AND timestamp >= ${new Date(bucketStart * 1000).toISOString()}
        AND timestamp < ${new Date(bucketEnd * 1000).toISOString()}
      ORDER BY timestamp ASC
    `;
    if (!rows.length) continue;
    const prices = rows.map(row => Number(row.price || 0));
    const candle: Candle = {
      mint: trade.mint,
      resolution,
      time: bucketStart,
      open: prices[0] ?? trade.priceSol,
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1] ?? trade.priceSol,
      volume: rows.reduce((sum, row) => sum + Number(row.volume || 0), 0),
      trades: rows.length,
    };
    await publish(redis, CHANNELS.CANDLE_UPDATE, candle);
  }
}

function getBucketStart(timestamp: number, resolution: Resolution): number {
  if (resolution === 'D') {
    const date = new Date(timestamp * 1000);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
  }
  const seconds = Number(resolution) * 60;
  return Math.floor(timestamp / seconds) * seconds;
}

function getBucketEnd(bucketStart: number, resolution: Resolution): number {
  if (resolution === 'D') return bucketStart + 86_400;
  return bucketStart + Number(resolution) * 60;
}
