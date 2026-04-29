import Redis from 'ioredis';
import { logger } from './logger.js';
/**
 * Channel names used between indexer (publisher) and ws service (subscriber).
 * Keep this in sync — typo here is silent failure.
 */
export const CHANNELS = {
    TRADE: 'carpet:trade',
    CANDLE_UPDATE: 'carpet:candle',
    POOL_CREATED: 'carpet:pool-created',
    MIGRATION: 'carpet:migration',
};
const defaultOpts = {
    maxRetriesPerRequest: null, // required for pub/sub
    enableReadyCheck: true,
    lazyConnect: false,
};
/**
 * Create a Redis client. Each service should create its own.
 * Pub and Sub need separate connections (Redis protocol limitation).
 */
export function createRedis(url, role = 'cache') {
    const client = new Redis(url, defaultOpts);
    client.on('connect', () => logger.info({ role }, 'Redis connected'));
    client.on('error', (err) => logger.error({ role, err: err.message }, 'Redis error'));
    client.on('close', () => logger.warn({ role }, 'Redis connection closed'));
    return client;
}
export function publish(client, channel, payload) {
    const msg = { channel, payload, timestamp: Date.now() };
    return client.publish(channel, JSON.stringify(msg));
}
//# sourceMappingURL=redis.js.map