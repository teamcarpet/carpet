import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '@carpet/shared/db';

const querySchema = z.object({
  mint:   z.string().min(32).max(44),
  limit:  z.coerce.number().int().min(1).max(500).default(100),
  minSol: z.coerce.number().nonnegative().optional(),
  before: z.coerce.number().int().positive().optional(),  // pagination — unix seconds
});

export const tradesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/trades', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid query', issues: parsed.error.issues };
    }
    const { mint, limit, minSol, before } = parsed.data;

    const minSolFilter = minSol ? sql`AND amount_sol >= ${minSol}` : sql``;
    const beforeFilter = before ? sql`AND timestamp < ${new Date(before * 1000)}` : sql``;

    const rows = await sql`
      SELECT
        signature, account, side,
        amount_sol   AS "amountSol",
        amount_token AS "amountToken",
        price_sol    AS "priceSol",
        price_usd    AS "priceUsd",
        extract(epoch FROM timestamp)::int AS timestamp,
        slot
      FROM trades
      WHERE mint = ${mint} ${minSolFilter} ${beforeFilter}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    return { trades: rows };
  });
};
