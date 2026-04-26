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
  round:       number;
  timestamp:   number;
}

export async function handlePresaleContribution(evt: ContributionEvent, _redis: Redis): Promise<void> {
  await sql`
    INSERT INTO presale_state (pool, mint, mode, total_rounds, current_round, start_time, end_time, total_raised_sol, contributors)
    VALUES (${evt.pool}, ${evt.mint}, 0, 6, ${evt.round}, NOW(), NOW(), ${evt.amountSol}, 1)
    ON CONFLICT (pool) DO UPDATE SET
      total_raised_sol = presale_state.total_raised_sol + ${evt.amountSol},
      current_round    = ${evt.round}
  `;
  logger.debug({ amount: evt.amountSol, round: evt.round }, 'presale contribution');
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
