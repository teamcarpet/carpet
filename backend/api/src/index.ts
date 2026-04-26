// ─────────────────────────────────────────────────────────────────────────
// CARPET API — REST endpoints for the frontend.
//
// Routes:
//   GET /health
//   GET /token?mint=...
//   GET /tokens?col=new|bonding|migrated&sort=...
//   GET /candles?mint=...&resolution=...&from=...&to=...
//   GET /trades?mint=...&limit=...&minSol=...
//
// All endpoints are public (no auth) — protected by per-IP rate limiting.
// ─────────────────────────────────────────────────────────────────────────

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { loadEnv, logger } from '@carpet/shared';
import { sql } from '@carpet/shared/db';
import { healthRoutes }  from './routes/health.js';
import { tokenRoutes }   from './routes/token.js';
import { tokensRoutes }  from './routes/tokens.js';
import { candlesRoutes } from './routes/candles.js';
import { tradesRoutes }  from './routes/trades.js';

const env = loadEnv(z.object({
  API_PORT:             z.coerce.number().int().positive().default(3000),
  RATE_LIMIT_MAX:       z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
}));

const app = Fastify({
  loggerInstance: logger,
  trustProxy: true,         // Railway sits behind a proxy
  bodyLimit:  1024 * 1024,  // 1 MB — we never accept large bodies
});

// ── Plugins ──────────────────────────────────────────────────────────────
await app.register(cors, {
  origin: true,                   // allow any origin — public read API
  methods: ['GET', 'OPTIONS'],
  credentials: false,
});

await app.register(rateLimit, {
  max:        env.RATE_LIMIT_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW_MS,
  keyGenerator: (req) => req.ip,  // limit per client IP
  errorResponseBuilder: (_req, ctx) => ({
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Retry in ${Math.ceil(ctx.ttl / 1000)}s.`,
    retryAfter: Math.ceil(ctx.ttl / 1000),
  }),
});

// ── Routes ───────────────────────────────────────────────────────────────
await app.register(healthRoutes);
await app.register(tokenRoutes);
await app.register(tokensRoutes);
await app.register(candlesRoutes);
await app.register(tradesRoutes);

// ── Boot ─────────────────────────────────────────────────────────────────
try {
  // Railway sets PORT — prefer it over our env default
  const port = Number(process.env.PORT ?? env.API_PORT);
  await app.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'API listening');
} catch (err) {
  logger.fatal({ err }, 'API failed to start');
  process.exit(1);
}

// ── Graceful shutdown ────────────────────────────────────────────────────
function shutdown(reason: string): void {
  logger.info({ reason }, 'API shutting down');
  void app.close().then(() => sql.end({ timeout: 5 })).then(() => process.exit(0));
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
