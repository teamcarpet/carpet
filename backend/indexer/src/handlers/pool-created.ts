// ─────────────────────────────────────────────────────────────────────────
// Handles PoolCreated event (emitted by initialize_bonding / initialize_presale).
//
// Inserts the new token + initial pool_state row, broadcasts on Redis so
// the frontend can show the new token in the "New" column without polling.
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import { sql } from '@carpet/shared/db';
import { CHANNELS, publish, logger } from '@carpet/shared';
import type { PoolType } from '@carpet/shared/types';

export interface PoolCreatedEvent {
  pool:       string;
  mint:       string;
  creator:    string;
  ticker:     string;
  name:       string;
  imageUrl:   string | null;
  poolType:   PoolType;
  meteoraPool?: string | null;
  migrationTarget: number;     // SOL
  timestamp:  number;
  slot:       number;
}

export async function handlePoolCreated(evt: PoolCreatedEvent, redis: Redis): Promise<void> {
  await sql`
    INSERT INTO tokens (
      mint, ticker, name, image_url, creator,
      pool_type, pool_address, created_at, is_migrated
    ) VALUES (
      ${evt.mint}, ${evt.ticker}, ${evt.name}, ${evt.imageUrl}, ${evt.creator},
      ${evt.poolType}, ${evt.pool}, ${new Date(evt.timestamp * 1000)}, false
    )
    ON CONFLICT (mint) DO NOTHING
  `;

  await sql`
    INSERT INTO pool_state (pool, mint, migration_target)
    VALUES (${evt.pool}, ${evt.mint}, ${evt.migrationTarget})
    ON CONFLICT (pool) DO NOTHING
  `;

  await publish(redis, CHANNELS.POOL_CREATED, evt);
  logger.info({ ticker: evt.ticker, mint: evt.mint.slice(0, 8) }, 'pool created');
}
