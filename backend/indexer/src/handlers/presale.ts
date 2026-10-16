// ─────────────────────────────────────────────────────────────────────────
// Handles presale-specific events:
//   - PresaleContribution
//   - PresaleClaimed
//   - PresaleRefunded
//
// Maintains presale_state with raised totals and contributor count.
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import { sql } from '@carpet/shared/db';
import { logger } from '@carpet/shared';

export interface ContributionEvent {
  pool:        string;
  mint:        string;
  contributor: string;
  amountSol:   number;
  totalRaisedSol?: number;
  round:       number;
  timestamp:   number;
}

export async function handlePresaleContribution(evt: ContributionEvent, _redis: Redis): Promise<void> {
  // total_raised comes straight from the event, so replaying history is safe.
  const total = evt.totalRaisedSol ?? evt.amountSol;
  await sql`
    INSERT INTO presale_state (pool, mint, mode, total_rounds, current_round, start_time, end_time, total_raised_sol, contributors)
    VALUES (${evt.pool}, ${evt.mint}, 0, 6, ${evt.round}, NOW(), NOW(), ${total}, 0)
    ON CONFLICT (pool) DO UPDATE SET
      total_raised_sol = GREATEST(presale_state.total_raised_sol, ${total})
  `;
  await sql`
    UPDATE pool_state
    SET total_raised_sol = GREATEST(total_raised_sol, ${total}),
        progress_pct = LEAST(100, (GREATEST(total_raised_sol, ${total}) / NULLIF(migration_target, 0)) * 100),
        last_updated = NOW()
    WHERE pool = ${evt.pool}
  `;
  logger.debug({ amount: evt.amountSol, total }, 'presale contribution');
}

export interface ClaimEvent {
  pool:    string;
  mint:    string;
  account: string;
  amount:  number;
  timestamp: number;
}

export async function handlePresaleClaim(_evt: ClaimEvent, _redis: Redis): Promise<void> {
  // No state change beyond logging — claims don't affect raised total
  // (they distribute already-raised supply to contributors)
}

export async function handlePresaleRefund(evt: ClaimEvent, _redis: Redis): Promise<void> {
  await sql`
    UPDATE presale_state
    SET total_raised_sol = GREATEST(0, total_raised_sol - ${evt.amount})
    WHERE pool = ${evt.pool}
  `;
  logger.debug({ amount: evt.amount }, 'presale refund');
}
