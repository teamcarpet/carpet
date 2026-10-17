import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '@carpet/shared/db';

// Price line for the token page: one point per step (1s…15m), last trade
// price in each bucket plus buy/sell counts and volume. Empty buckets are
// left out — the client carries the previous price forward, and `seed` is the
// last price before the window so the line never starts from nothing.

const STEPS: Record<string, number> = { '1s': 1, '5s': 5, '30s': 30, '1m': 60, '5m': 300, '15m': 900 };

const querySchema = z.object({
  mint:   z.string().min(32).max(44),
  step:   z.enum(['1s', '5s', '30s', '1m', '5m', '15m']).default('1m'),
  points: z.coerce.number().int().min(10).max(500).default(60),
});

export const seriesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/series', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid query', issues: parsed.error.issues };
    }
    const { mint, step, points } = parsed.data;
    const stepSec = STEPS[step]!;
    const nowSec = Math.floor(Date.now() / 1000);
    const toSec = Math.floor(nowSec / stepSec) * stepSec;
    const fromSec = toSec - (points - 1) * stepSec;
    const from = new Date(fromSec * 1000).toISOString();

    const [rows, seedRows] = await Promise.all([
      sql`
        SELECT
          extract(epoch FROM time_bucket(make_interval(secs => ${stepSec}), timestamp))::bigint AS t,
          last(price_sol, timestamp)                       AS close,
          count(*) FILTER (WHERE side = 'buy')::int        AS buys,
          count(*) FILTER (WHERE side = 'sell')::int       AS sells,
          coalesce(sum(amount_sol), 0)::float8             AS vol
        FROM trades
        WHERE mint = ${mint} AND timestamp >= ${from}
        GROUP BY 1
        ORDER BY 1
      `,
      sql`
        SELECT price_sol AS price FROM trades
        WHERE mint = ${mint} AND timestamp < ${from}
        ORDER BY timestamp DESC
        LIMIT 1
      `,
    ]);

    reply.header('Cache-Control', 'no-store');
    return {
      step,
      stepSec,
      from: fromSec,
      to: toSec,
      seed: seedRows[0]?.price ?? null,
      points: rows.map(r => ({
        t: Number(r.t),
        close: Number(r.close),
        buys: r.buys,
        sells: r.sells,
        vol: Number(r.vol),
      })),
    };
  });
};
