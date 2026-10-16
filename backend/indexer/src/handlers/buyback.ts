// ─────────────────────────────────────────────────────────────────────────
// BuybackExecuted → buybacks table. The swap happens on Meteora, so it never
// shows up as a CARPET trade; this table is the only record of the burns.
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import { sql } from '@carpet/shared/db';
import { CHANNELS, publish, logger } from '@carpet/shared';

export interface BuybackEvent {
  signature:         string;
  pool:              string;
  mint:              string;
  amountSolSpent:    number;
  amountTokenBurned: number;
  roundNumber:       number;
  totalRounds:       number;
  timestamp:         number;
  slot:              number;
}

export async function handleBuyback(evt: BuybackEvent, redis: Redis): Promise<void> {
  const rows = await sql`
    INSERT INTO buybacks (signature, pool, mint, sol_spent, tokens_burned, round_number, total_rounds, timestamp, slot)
    VALUES (
      ${evt.signature}, ${evt.pool}, ${evt.mint}, ${evt.amountSolSpent}, ${evt.amountTokenBurned},
      ${evt.roundNumber}, ${evt.totalRounds}, ${new Date(evt.timestamp * 1000).toISOString()}, ${evt.slot}
    )
    ON CONFLICT (signature, pool) DO NOTHING
    RETURNING 1
  `;
  if (!rows.length) return;
  await publish(redis, CHANNELS.BUYBACK, evt);
  logger.info(
    { mint: evt.mint.slice(0, 8), sol: evt.amountSolSpent, burned: evt.amountTokenBurned },
    'buyback executed',
  );
}
