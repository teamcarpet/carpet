// ─────────────────────────────────────────────────────────────────────────
// Handles MigrationReady and MigrationCompleted events.
//
// When MigrationCompleted fires we flip is_migrated=true on the token row,
// store the new Meteora pool address, and broadcast so the frontend can
// move the token from "Almost bonded" to "Graduated" column instantly.
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import { sql } from '@carpet/shared/db';
import { CHANNELS, publish, logger } from '@carpet/shared';

export interface MigrationCompletedEvent {
  pool:        string;
  mint:        string;
  meteoraPool: string;
  reserveSol:  number;
  timestamp:   number;
  slot:        number;
}

export async function handleMigrationCompleted(evt: MigrationCompletedEvent, redis: Redis): Promise<void> {
  await sql`
    UPDATE tokens
    SET is_migrated = true, meteora_pool = ${evt.meteoraPool}
    WHERE mint = ${evt.mint}
  `;
  await sql`
    UPDATE pool_state
    SET is_migrated  = true,
        progress_pct = 100,
        last_updated = NOW()
    WHERE pool = ${evt.pool}
  `;
  await publish(redis, CHANNELS.MIGRATION, evt);
  logger.info({ mint: evt.mint.slice(0, 8) }, 'migration completed');
}

export interface MigrationReadyEvent {
  pool:       string;
  mint:       string;
  reserveSol: number;
  timestamp:  number;
}

export async function handleMigrationReady(_evt: MigrationReadyEvent, _redis: Redis): Promise<void> {
  // Pool reached the target; just a hint event. Nothing to write.
  // The actual migration tx will fire MigrationCompleted shortly after.
}
