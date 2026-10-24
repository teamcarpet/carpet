// ─────────────────────────────────────────────────────────────────────────
// CARPET indexer — entry point
//
//   1. apply DB migrations (idempotent)
//   2. backfill program history from the persisted cursor (RPC)
//   3. stream live events:
//        INDEXER_SOURCE=grpc → Yellowstone gRPC (Shyft) — mainnet
//        INDEXER_SOURCE=rpc  → RPC websocket logs        — any cluster
//        INDEXER_SOURCE=auto → grpc when a Geyser endpoint is set and the
//                              cluster is mainnet, rpc otherwise
//      The RPC catch-up poller keeps running under both as a safety net.
//   MOCK_MODE=true emits fake trades instead (local pipeline testing).
// ─────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import http from 'node:http';
import { loadEnv, logger, createRedis, runMigrations } from '@carpet/shared';
import { sql } from '@carpet/shared/db';
import { startMockEmitter } from './mock.js';
import { initDecoder } from './decoder.js';
import { createDispatchContext } from './dispatch.js';
import { startGeyser } from './geyser.js';
import { startRpcSource } from './rpc-source.js';
import { startMetadataRefresher } from './metadata.js';
import { startHolderRefresher } from './holders.js';
import { refreshAllCandles, startAggregator } from './aggregator.js';
import { startMeteoraPriceRefresher } from './meteora-price.js';

const bool = z.preprocess(v => {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return false;
  return ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase());
}, z.boolean());

const env = loadEnv(z.object({
  INDEXER_SOURCE:   z.enum(['auto', 'rpc', 'grpc']).default('auto'),
  GEYSER_ENDPOINT:  z.string().url().optional(),
  GEYSER_X_TOKEN:   z.string().min(1).optional(),
  CATCHUP_POLL_MS:  z.coerce.number().int().min(1000).default(5000),
  MOCK_MODE:        bool.default(false),
  MOCK_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
}));

const source = env.INDEXER_SOURCE === 'auto'
  ? (env.GEYSER_ENDPOINT && env.GEYSER_X_TOKEN && env.SOLANA_CLUSTER === 'mainnet' ? 'grpc' : 'rpc')
  : env.INDEXER_SOURCE;

if (source === 'grpc' && (!env.GEYSER_ENDPOINT || !env.GEYSER_X_TOKEN)) {
  logger.fatal('INDEXER_SOURCE=grpc needs GEYSER_ENDPOINT and GEYSER_X_TOKEN');
  process.exit(1);
}

logger.info({ source, mock: env.MOCK_MODE, cluster: env.SOLANA_CLUSTER, programId: env.PROGRAM_ID }, 'Indexer starting');

const redis = createRedis(env.REDIS_URL, 'publisher');
let ready = false;

// ── Health endpoint ──────────────────────────────────────────────────────
const healthServer = http.createServer(async (req, res) => {
  if (req.url !== '/health') { res.writeHead(404).end(); return; }
  try {
    await sql`SELECT 1`;
    await redis.ping();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: Date.now(), source: env.MOCK_MODE ? 'mock' : source, caughtUp: ready }));
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Health check failed');
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
  }
});
healthServer.listen(Number(process.env.PORT ?? 3002), () => logger.info('Health endpoint ready'));

// ── Boot ─────────────────────────────────────────────────────────────────
await runMigrations(sql, msg => logger.info(msg));
logger.info('Database migrations applied');

if (env.MOCK_MODE) {
  startMockEmitter({ redis, intervalMs: env.MOCK_INTERVAL_MS });
  ready = true;
} else {
  if (!(await initDecoder(env.PROGRAM_ID))) {
    logger.fatal('IDL failed to load — check IDL_PATH or bundled idl/launchpad.json');
    process.exit(1);
  }
  const ctx = createDispatchContext(redis, env.SOLANA_RPC_URL);

  const { caughtUp } = startRpcSource({
    ctx,
    programId: env.PROGRAM_ID,
    live: source === 'rpc',
    pollMs: source === 'rpc' ? env.CATCHUP_POLL_MS : 60_000,
  });
  if (source === 'grpc') {
    startGeyser({ ctx, endpoint: env.GEYSER_ENDPOINT!, xToken: env.GEYSER_X_TOKEN!, programId: env.PROGRAM_ID });
  }
  startMetadataRefresher(ctx.connection);
  startHolderRefresher(ctx.connection);
  startMeteoraPriceRefresher(ctx.connection);

  caughtUp.then(async () => {
    ready = true;
    // Backfilled trades sit below the aggregates' watermark — materialize them.
    await refreshAllCandles();
  }).catch(() => {});
}

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
