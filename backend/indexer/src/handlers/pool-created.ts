// ─────────────────────────────────────────────────────────────────────────
// PoolCreated → tokens + pool_state rows, then broadcast.
// Idempotent: replaying the same event (backfill + live) changes nothing,
// except that real metadata replaces a placeholder written earlier.
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import { sql } from '@carpet/shared/db';
import { CHANNELS, publish, logger } from '@carpet/shared';
import type { PoolType } from '@carpet/shared/types';
import type { TokenMetadata } from '../metadata.js';

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
  supply:     number;          // whole tokens
  metadata:   TokenMetadata | null;
  timestamp:  number;
  slot:       number;
}

export async function handlePoolCreated(evt: PoolCreatedEvent, redis: Redis): Promise<void> {
  const m = evt.metadata;
  const inserted = await sql`
    INSERT INTO tokens (
      mint, ticker, name, image_url, creator,
      pool_type, pool_address, created_at, is_migrated,
      description, website, twitter, telegram, metadata_uri, supply, metadata_ok
    ) VALUES (
      ${evt.mint}, ${evt.ticker}, ${evt.name}, ${evt.imageUrl}, ${evt.creator},
      ${evt.poolType}, ${evt.pool}, ${new Date(evt.timestamp * 1000).toISOString()}, false,
      ${m?.description ?? null}, ${m?.website ?? null}, ${m?.twitter ?? null}, ${m?.telegram ?? null},
      ${m?.uri ?? null}, ${evt.supply}, ${m != null}
    )
    ON CONFLICT (mint) DO UPDATE SET
      ticker       = EXCLUDED.ticker,
      name         = EXCLUDED.name,
      image_url    = EXCLUDED.image_url,
      description  = EXCLUDED.description,
      website      = EXCLUDED.website,
      twitter      = EXCLUDED.twitter,
      telegram     = EXCLUDED.telegram,
      metadata_uri = EXCLUDED.metadata_uri,
      metadata_ok  = true
    WHERE tokens.metadata_ok = false AND EXCLUDED.metadata_ok = true
    RETURNING (xmax = 0) AS fresh
  `;

  await sql`
    INSERT INTO pool_state (pool, mint, migration_target)
    VALUES (${evt.pool}, ${evt.mint}, ${evt.migrationTarget})
    ON CONFLICT (pool) DO UPDATE SET
      migration_target = EXCLUDED.migration_target,
      last_updated = NOW()
  `;

  // Only announce genuinely new launches, not backfill replays.
  if (inserted[0]?.fresh) {
    await publish(redis, CHANNELS.POOL_CREATED, evt);
    logger.info({ ticker: evt.ticker, mint: evt.mint.slice(0, 8) }, 'pool created');
  }
}
