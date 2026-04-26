import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '@carpet/shared/db';

const querySchema = z.object({
  mint: z.string().min(32).max(44),
});

export const tokenRoutes: FastifyPluginAsync = async (app) => {
  app.get('/token', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid query', issues: parsed.error.issues };
    }
    const { mint } = parsed.data;

    // JOIN tokens with latest pool_state and 24h aggregate
    const rows = await sql`
      WITH latest AS (
        SELECT
          t.mint, t.ticker, t.name, t.image_url AS "imageUrl",
          t.creator, t.pool_type AS "poolType", t.pool_address AS "poolAddress",
          extract(epoch FROM t.created_at)::int AS "createdAt",
          t.is_migrated AS "isMigrated", t.meteora_pool AS "meteoraPool",
          t.ath,
          ps.price_sol AS "priceSol",
          ps.price_usd AS "priceUsd",
          ps.market_cap AS "marketCap",
          ps.progress_pct AS "prog"
        FROM tokens t
        LEFT JOIN pool_state ps ON ps.mint = t.mint
        WHERE t.mint = ${mint}
        LIMIT 1
      ),
      vol24 AS (
        SELECT
          coalesce(sum(amount_sol), 0)::float8 AS "volume24h",
          count(*)::int AS trades24h,
          count(DISTINCT account)::int AS holders
        FROM trades
        WHERE mint = ${mint}
          AND timestamp > NOW() - INTERVAL '24 hours'
      ),
      pct24 AS (
        SELECT
          (SELECT price_sol FROM trades WHERE mint = ${mint} AND timestamp > NOW() - INTERVAL '24 hours' ORDER BY timestamp ASC  LIMIT 1) AS price_24h_ago,
          (SELECT price_sol FROM trades WHERE mint = ${mint}                                            ORDER BY timestamp DESC LIMIT 1) AS price_now
      )
      SELECT
        latest.*,
        coalesce(vol24."volume24h", 0)  AS "volume24h",
        coalesce(vol24.holders, 0)      AS holders,
        CASE
          WHEN pct24.price_24h_ago IS NULL OR pct24.price_24h_ago = 0 THEN 0
          ELSE ((pct24.price_now - pct24.price_24h_ago) / pct24.price_24h_ago * 100)::float8
        END AS "pctChange24h"
      FROM latest, vol24, pct24
    `;

    if (!rows.length) {
      reply.code(404);
      return { error: 'Token not found' };
    }
    return rows[0];
  });
};
