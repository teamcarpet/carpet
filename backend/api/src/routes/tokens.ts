import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '@carpet/shared/db';

const querySchema = z.object({
  col:    z.enum(['new', 'bonding', 'migrated', 'all']).default('all'),
  sort:   z.enum(['date', 'volume', 'mc', 'progress', 'pct']).default('date'),
  limit:  z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().max(64).optional(),
});

export const tokensRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tokens', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid query', issues: parsed.error.issues };
    }
    const { col, sort, limit, search } = parsed.data;

    // Map UI column to DB filter
    let colFilter = sql``;
    if (col === 'new')      colFilter = sql`AND t.is_migrated = false AND ps.progress_pct < 50`;
    if (col === 'bonding')  colFilter = sql`AND t.is_migrated = false AND ps.progress_pct >= 50`;
    if (col === 'migrated') colFilter = sql`AND t.is_migrated = true`;

    const searchFilter = search
      ? sql`AND (t.ticker ILIKE ${'%' + search + '%'} OR t.name ILIKE ${'%' + search + '%'})`
      : sql``;

    // Sort field — must whitelist to prevent SQL injection via order-by
    const sortClause = {
      date:     sql`t.created_at DESC`,
      volume:   sql`coalesce(v."volume24h", 0) DESC`,
      mc:       sql`coalesce(ps.market_cap, 0) DESC`,
      progress: sql`coalesce(ps.progress_pct, 0) DESC`,
      pct:      sql`coalesce(p."pctChange24h", 0) DESC`,
    }[sort];

    const rows = await sql`
      SELECT
        t.mint, t.ticker, t.name, t.image_url AS "imageUrl",
        t.creator, t.pool_type AS "poolType",
        extract(epoch FROM t.created_at)::int AS "createdAt",
        t.is_migrated AS "isMigrated",
        coalesce(ps.price_sol,    0)  AS "priceSol",
        coalesce(ps.market_cap,   0)  AS "marketCap",
        coalesce(ps.progress_pct, 0)  AS prog,
        coalesce(v."volume24h",   0)  AS "volume24h",
        coalesce(v.holders,       0)  AS holders,
        coalesce(p."pctChange24h", 0) AS "pctChange24h"
      FROM tokens t
      LEFT JOIN pool_state ps ON ps.mint = t.mint
      LEFT JOIN LATERAL (
        SELECT
          sum(amount_sol)::float8         AS "volume24h",
          count(DISTINCT account)::int    AS holders
        FROM trades
        WHERE mint = t.mint AND timestamp > NOW() - INTERVAL '24 hours'
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT (
          (SELECT price_sol FROM trades WHERE mint = t.mint                                    ORDER BY timestamp DESC LIMIT 1)
          - (SELECT price_sol FROM trades WHERE mint = t.mint AND timestamp > NOW() - INTERVAL '24 hours' ORDER BY timestamp ASC  LIMIT 1)
        )
        / NULLIF((SELECT price_sol FROM trades WHERE mint = t.mint AND timestamp > NOW() - INTERVAL '24 hours' ORDER BY timestamp ASC LIMIT 1), 0)
        * 100 AS "pctChange24h"
      ) p ON true
      WHERE 1=1 ${colFilter} ${searchFilter}
      ORDER BY ${sortClause}
      LIMIT ${limit}
    `;

    return { tokens: rows };
  });
};
