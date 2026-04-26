import Redis, { type RedisOptions } from 'ioredis';
import { logger } from './logger.js';

/**
 * Channel names used between indexer (publisher) and ws service (subscriber).
 * Keep this in sync — typo here is silent failure.
 */
export const CHANNELS = {
  TRADE:           'carpet:trade',
  CANDLE_UPDATE:   'carpet:candle',
  POOL_CREATED:    'carpet:pool-created',
  MIGRATION:       'carpet:migration',
} as const;

export type Channel = typeof CHANNELS[keyof typeof CHANNELS];

const defaultOpts: RedisOptions = {
  maxRetriesPerRequest: null, // required for pub/sub
  enableReadyCheck:     true,
  lazyConnect:          false,
};

/**
 * Create a Redis client. Each service should create its own.
 * Pub and Sub need separate connections (Redis protocol limitation).
 */
export function createRedis(url: string, role: 'publisher' | 'subscriber' | 'cache' = 'cache'): Redis {
  const client = new Redis(url, defaultOpts);

  client.on('connect', () => logger.info({ role }, 'Redis connected'));
  client.on('error',   (err) => logger.error({ role, err: err.message }, 'Redis error'));
  client.on('close',   () => logger.warn({ role }, 'Redis connection closed'));

  return client;
}

/**
 * Wire-format for messages broadcast over Redis pub/sub.
 * Stays small and string-only so any consumer (including non-TS) can read.
 */
export interface PubSubMessage<T = unknown> {
  channel:   Channel;
  payload:   T;
  timestamp: number;
}

export function publish<T>(client: Redis, channel: Channel, payload: T): Promise<number> {
  const msg: PubSubMessage<T> = { channel, payload, timestamp: Date.now() };
  return client.publish(channel, JSON.stringify(msg));
}
