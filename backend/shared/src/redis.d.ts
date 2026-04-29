import Redis from 'ioredis';
/**
 * Channel names used between indexer (publisher) and ws service (subscriber).
 * Keep this in sync — typo here is silent failure.
 */
export declare const CHANNELS: {
    readonly TRADE: "carpet:trade";
    readonly CANDLE_UPDATE: "carpet:candle";
    readonly POOL_CREATED: "carpet:pool-created";
    readonly MIGRATION: "carpet:migration";
};
export type Channel = typeof CHANNELS[keyof typeof CHANNELS];
/**
 * Create a Redis client. Each service should create its own.
 * Pub and Sub need separate connections (Redis protocol limitation).
 */
export declare function createRedis(url: string, role?: 'publisher' | 'subscriber' | 'cache'): Redis;
/**
 * Wire-format for messages broadcast over Redis pub/sub.
 * Stays small and string-only so any consumer (including non-TS) can read.
 */
export interface PubSubMessage<T = unknown> {
    channel: Channel;
    payload: T;
    timestamp: number;
}
export declare function publish<T>(client: Redis, channel: Channel, payload: T): Promise<number>;
