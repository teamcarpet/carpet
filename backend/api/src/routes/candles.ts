import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '@carpet/shared/db';

const querySchema = z.object({
  mint:       z.string().min(32).max(44),
  resolution: z.enum(['1', '5', '15', '60', '240', 'D']),
  from:       z.coerce.number().int().nonnegative().optional(),
  to:         z.coerce.number().int().positive().optional(),
  countBack:  z.coerce.number().int().min(1).max(5000).optional(),
  priceMode:  z.enum(['mcap', 'price']).default('mcap'),
});

// Map TradingView resolution → continuous aggregate view name
const VIEW_MAP: Record<string, string> = {
  '1':   'candles_1m',
  '5':   'candles_5m',
  '15':  'candles_15m',
  '60':  'candles_1h',
  '240': 'candles_4h',
  'D':   'candles_1d',
};

export const candlesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/candles', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid query', issues: parsed.error.issues };
    }
    const { mint, resolution, from, to, countBack } = parsed.data;
    const view = VIEW_MAP[resolution];
    if (!view) {
      reply.code(400);
      return { error: 'Unknown resolution' };
    }

    const fromTs = from ? new Date(from * 1000) : new Date(Date.now() - 24 * 3600_000);
    const toTs   = to   ? new Date(to * 1000)   : new Date();
    const limit  = countBack ?? 1000;

    // Aggregates store time as `bucket` — alias to `time` for the wire format
    const rows = await sql.unsafe(
      `SELECT
         extract(epoch FROM bucket)::int AS time,
         open, high, low, close, volume, trades
       FROM ${view}
       WHERE mint = $1 AND bucket BETWEEN $2 AND $3
       ORDER BY bucket DESC
       LIMIT $4`,
      [mint, fromTs.toISOString(), toTs.toISOString(), limit],
    );

    // TradingView expects ascending time order
    rows.reverse();

    return { bars: rows };
  });
};
