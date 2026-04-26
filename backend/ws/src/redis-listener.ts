// ─────────────────────────────────────────────────────────────────────────
// Redis pub/sub → WebSocket bridge.
//
// The indexer publishes every event to Redis. We subscribe here and route
// each message to the right broadcast method on the ConnectionManager.
//
// Decoupling indexer ↔ ws via Redis lets us scale ws independently:
// run multiple WS instances, each consuming the same pub/sub stream,
// and Redis takes care of fan-out. (Pub/sub doesn't queue — late
// subscribers miss old messages, which is fine for real-time data.)
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import { CHANNELS, logger } from '@carpet/shared';
import type { PubSubMessage } from '@carpet/shared/redis';
import type { Trade, Candle } from '@carpet/shared/types';
import type { ConnectionManager } from './connections.js';

interface Args {
  redis:        Redis;
  connections:  ConnectionManager;
}

export function startRedisListener({ redis, connections }: Args): void {
  // Subscribe to all channels we care about
  const channels = Object.values(CHANNELS);
  redis.subscribe(...channels, (err, count) => {
    if (err) {
      logger.error({ err: err.message }, 'Failed to subscribe to Redis channels');
      return;
    }
    logger.info({ channels: count }, 'Redis subscriber active');
  });

  redis.on('message', (channel, raw) => {
    let msg: PubSubMessage<unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      logger.warn({ channel }, 'Malformed pub/sub message — skipped');
      return;
    }

    switch (channel) {
      case CHANNELS.TRADE:
        connections.broadcastTrade(msg.payload as Trade);
        break;
      case CHANNELS.CANDLE_UPDATE:
        connections.broadcastCandle(msg.payload as Candle);
        break;
      case CHANNELS.POOL_CREATED:
      case CHANNELS.MIGRATION:
        // These don't have a dedicated broadcast yet — extend if frontend
        // wants to react to new tokens / migrations in real time.
        logger.debug({ channel }, 'event received (no broadcast)');
        break;
      default:
        logger.warn({ channel }, 'Unknown channel');
    }
  });
}
