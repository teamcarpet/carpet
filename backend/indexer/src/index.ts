// ─────────────────────────────────────────────────────────────────────────
// CARPET indexer — entry point
//
// Dispatches between two modes depending on MOCK_MODE env var:
//   - MOCK_MODE=true  → emit fake trades every N seconds (Phase 2 dev)
//   - MOCK_MODE=false → connect to Yellowstone Geyser and stream real events
//
// In both modes, decoded events flow through the same `handlers/` pipeline
// that writes to Postgres and publishes to Redis.
// ─────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import http from 'node:http';
import { loadEnv, logger, createRedis } from '@carpet/shared';
import { sql } from '@carpet/shared/db';
import { startMockEmitter } from './mock.js';
import { startGeyser }      from './geyser.js';
import { startAggregator }  from './aggregator.js';

const env = loadEnv(z.object({
  GEYSER_ENDPOINT:  z.string().url(),
  GEYSER_X_TOKEN:   z.string().min(1),
  MOCK_MODE:        z.coerce.boolean().default(true),
  MOCK_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
}));

logger.info(
  { mockMode: env.MOCK_MODE, cluster: env.SOLANA_CLUSTER, programId: env.PROGRAM_ID },
  'Indexer starting',
);

// Redis publisher — handlers will use this to broadcast events to the WS service.
const redis = createRedis(env.REDIS_URL, 'publisher');

// ── Health endpoint ──────────────────────────────────────────────────────
// Railway pings /health to confirm the service is alive.
// We answer 200 only if Postgres + Redis are both reachable.
const healthServer = http.createServer(async (req, res) => {
  if (req.url !== '/health') {
    res.writeHead(404).end();
    return;
  }
  try {
    await sql`SELECT 1`;
    await redis.ping();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: Date.now(), mode: env.MOCK_MODE ? 'mock' : 'live' }));
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Health check failed');
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
  }
});

const HEALTH_PORT = Number(process.env.PORT ?? 3002);
healthServer.listen(HEALTH_PORT, () => {
  logger.info({ port: HEALTH_PORT }, 'Health endpoint ready');
});

// ── Pick a stream source ─────────────────────────────────────────────────
if (env.MOCK_MODE) {
  startMockEmitter({ redis, intervalMs: env.MOCK_INTERVAL_MS });
} else {
  startGeyser({
    redis,
    endpoint:  env.GEYSER_ENDPOINT,
    xToken:    env.GEYSER_X_TOKEN,
    programId: env.PROGRAM_ID,
  });
}

// ── Aggregator: refresh continuous aggregates on a cron ──────────────────
// TimescaleDB does most of the work; this just nudges the materialised views
// when we need fresher-than-policy data (e.g. last 1 minute candle).
startAggregator({ intervalMs: 60_000 });

// ── Graceful shutdown ────────────────────────────────────────────────────
function shutdown(reason: string) {
  logger.info({ reason }, 'Shutting down');
  healthServer.close();
  redis.disconnect();
  void sql.end({ timeout: 5 }).then(() => process.exit(0));
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException',  (err) => { logger.fatal({ err }, 'uncaughtException');  shutdown('uncaught'); });
process.on('unhandledRejection', (err) => { logger.fatal({ err }, 'unhandledRejection'); shutdown('unhandled'); });
