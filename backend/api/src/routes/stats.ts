import type { FastifyPluginAsync } from 'fastify';
import { sql } from '@carpet/shared/db';

// Platform-wide numbers for the landing page. Cheap enough to compute per
// request at launchpad scale; cached briefly at the edge.
export const statsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/stats', async (_req, reply) => {
    const [row] = await sql`
      SELECT
        (SELECT count(*)::int FROM tokens)                                         AS launched,
        (SELECT count(*)::int FROM tokens WHERE is_migrated)                       AS graduated,
        (SELECT coalesce(sum(total_raised_sol), 0)::float8 FROM pool_state)        AS "raisedSol",
        (SELECT coalesce(sum(amount_sol), 0)::float8 FROM trades)                  AS "volumeSol",
        (SELECT coalesce(sum(amount_sol), 0)::float8 FROM trades
           WHERE timestamp > NOW() - INTERVAL '24 hours')                          AS "volume24hSol",
        (SELECT count(*)::int FROM trades)                                         AS trades,
        (SELECT count(DISTINCT account)::int FROM trades)                          AS traders,
        (SELECT coalesce(sum(sol_spent), 0)::float8 FROM buybacks)                 AS "buybackSol",
        (SELECT coalesce(sum(tokens_burned), 0)::float8 FROM buybacks)             AS "tokensBurned"
    `;
    reply.header('Cache-Control', 'public, max-age=10');
    return row;
  });
};
