import pino from 'pino';
/**
 * Application-wide structured logger.
 * In dev: pretty-printed via pino-pretty.
 * In prod: JSON for log aggregators (Railway / Datadog / Logtail / etc).
 */
export declare const logger: pino.Logger<never, boolean>;
export type Logger = typeof logger;
