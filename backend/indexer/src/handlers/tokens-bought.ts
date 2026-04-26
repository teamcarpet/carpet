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
import type { Trade } from '@carpet/shared/types';

export async function handleTrade(trade: Trade, redis: Redis): Promise<void> {
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
    VALUES (${trade.pool}, ${trade.mint}, ${trade.priceSol}, NOW())
    ON CONFLICT (pool) DO UPDATE SET
      price_sol    = EXCLUDED.price_sol,
      last_updated = NOW()
  `;

  // 3. Broadcast for the WS service
  await publish(redis, CHANNELS.TRADE, trade);

  logger.debug({ side: trade.side, mint: trade.mint.slice(0, 8), sol: trade.amountSol }, 'trade');
}
