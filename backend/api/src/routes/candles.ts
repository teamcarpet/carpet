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

    const fromTs = from != null ? new Date(from * 1000) : new Date(Date.now() - 24 * 3600_000);
    const toTs   = to   != null ? new Date(to * 1000)   : new Date();
    const limit  = countBack ?? 1000;

    // Aggregates store time as `bucket` — alias to `time` for the wire format
    let rows: any[] = await sql.unsafe(
      `SELECT
         extract(epoch FROM bucket)::int AS time,
         open, high, low, close, volume, trades
       FROM ${view}
       WHERE mint = $1 AND bucket BETWEEN $2 AND $3
       ORDER BY bucket DESC
       LIMIT $4`,
      [mint, fromTs.toISOString(), toTs.toISOString(), limit],
    );

    if (!rows.length) {
      rows = await buildCandlesFromTrades(mint, resolution, fromTs, toTs, limit);
    }

    // TradingView expects ascending time order
    rows.reverse();

    return { bars: rows };
  });
};

async function buildCandlesFromTrades(
  mint: string,
  resolution: string,
  fromTs: Date,
  toTs: Date,
  limit: number,
) {
  const trades = await sql`
    SELECT
      extract(epoch FROM timestamp)::int AS time,
      price_sol AS price,
      amount_token AS volume
    FROM trades
    WHERE mint = ${mint}
      AND timestamp BETWEEN ${fromTs.toISOString()} AND ${toTs.toISOString()}
    ORDER BY timestamp DESC
    LIMIT ${limit * 20}
  `;

  const bucketSeconds = resolutionToSeconds(resolution);
  const buckets = new Map<number, {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    trades: number;
  }>();

  for (const trade of [...trades].reverse()) {
    const price = Number(trade.price || 0);
    const bucket = Math.floor(Number(trade.time) / bucketSeconds) * bucketSeconds;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, {
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: Number(trade.volume || 0),
        trades: 1,
      });
      continue;
    }
    existing.high = Math.max(existing.high, price);
    existing.low = Math.min(existing.low, price);
    existing.close = price;
    existing.volume += Number(trade.volume || 0);
    existing.trades += 1;
  }

  return [...buckets.values()].sort((a, b) => b.time - a.time).slice(0, limit);
}

function resolutionToSeconds(resolution: string): number {
  if (resolution === 'D') return 86_400;
  return Math.max(60, Number(resolution || 1) * 60);
}
