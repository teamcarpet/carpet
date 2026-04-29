import pino from 'pino';
const isDev = process.env.NODE_ENV !== 'production';
/**
 * Application-wide structured logger.
 * In dev: pretty-printed via pino-pretty.
 * In prod: JSON for log aggregators (Railway / Datadog / Logtail / etc).
 */
export const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    ...(isDev && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
        },
    }),
});
//# sourceMappingURL=logger.js.map