import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '@carpet/shared/db';

// Platform-wide pages: Furnace (burns), creator leaderboard, a wallet's
// portfolio and creator rewards.

const wallet = z.string().min(32).max(44);
const limit = z.coerce.number().int().min(1).max(100).default(50);

export const platformRoutes: FastifyPluginAsync = async (app) => {
  // 🔥 Furnace — every buyback-and-burn, newest first, plus running totals.
  app.get('/burns', async (req) => {
    const { limit: n } = z.object({ limit }).parse(req.query);
    const [rows, totals] = await Promise.all([
      sql`
        SELECT b.signature, b.mint, t.ticker, t.name, t.image_url AS "imageUrl",
               b.sol_spent AS "solSpent", b.tokens_burned AS "tokensBurned",
               b.round_number AS round, b.total_rounds AS "totalRounds",
               extract(epoch FROM b.timestamp)::bigint AS ts
        FROM buybacks b LEFT JOIN tokens t ON t.mint = b.mint
        ORDER BY b.timestamp DESC LIMIT ${n}
      `,
      sql`
        SELECT coalesce(sum(sol_spent), 0)::float8 AS "solSpent",
               count(*)::int AS burns,
               count(DISTINCT mint)::int AS tokens,
               coalesce(sum(sol_spent) FILTER (WHERE timestamp > NOW() - INTERVAL '24 hours'), 0)::float8 AS "solSpent24h",
               (SELECT coalesce(sum(sell_tax), 0)::float8 FROM trades) AS "sellTaxCollected"
        FROM buybacks
      `,
    ]);
    return { burns: rows, totals: totals[0] };
  });

  // Creators ranked by track record, not volume: graduations first, then
  // graduation rate, then how many people traded their tokens.
  app.get('/leaderboard/creators', async (req) => {
    const { limit: n } = z.object({ limit }).parse(req.query);
    const rows = await sql`
      SELECT t.creator,
             count(*)::int                                        AS launched,
             count(*) FILTER (WHERE t.is_migrated)::int           AS graduated,
             coalesce(max(t.ath), 0)::float8                      AS "bestAth",
             coalesce(sum(tr.vol), 0)::float8                     AS "volumeSol",
             coalesce(sum(tr.traders), 0)::int                    AS traders,
             coalesce(sum(tr.fees), 0)::float8                    AS "feesSol",
             (array_agg(t.ticker ORDER BY t.ath DESC))[1]         AS "bestTicker",
             (array_agg(t.mint ORDER BY t.ath DESC))[1]           AS "bestMint"
      FROM tokens t
      LEFT JOIN LATERAL (
        SELECT sum(amount_sol) AS vol, count(DISTINCT account) AS traders, sum(fee_creator) AS fees
        FROM trades WHERE mint = t.mint
      ) tr ON true
      GROUP BY t.creator
      ORDER BY graduated DESC, (count(*) FILTER (WHERE t.is_migrated))::float / count(*) DESC, traders DESC
      LIMIT ${n}
    `;
    return { creators: rows };
  });

  // A wallet's positions on CARPET: what it put in and took out per token.
  // Current balances and prices are added client-side from the chain.
  app.get('/portfolio', async (req) => {
    const { wallet: w } = z.object({ wallet }).parse(req.query);
    const rows = await sql`
      SELECT tr.mint, t.ticker, t.name, t.image_url AS "imageUrl", t.is_migrated AS "isMigrated",
             coalesce(sum(tr.amount_sol)   FILTER (WHERE tr.side = 'buy'),  0)::float8 AS "solIn",
             coalesce(sum(tr.amount_sol)   FILTER (WHERE tr.side = 'sell'), 0)::float8 AS "solOut",
             coalesce(sum(tr.amount_token) FILTER (WHERE tr.side = 'buy'),  0)::float8 AS "tokensIn",
             coalesce(sum(tr.amount_token) FILTER (WHERE tr.side = 'sell'), 0)::float8 AS "tokensOut",
             coalesce(ps.price_sol, 0)::float8 AS "priceSol",
             max(tr.timestamp) AS "lastTrade"
      FROM trades tr
      LEFT JOIN tokens t ON t.mint = tr.mint
      LEFT JOIN pool_state ps ON ps.mint = tr.mint
      WHERE tr.account = ${w}
      GROUP BY tr.mint, t.ticker, t.name, t.image_url, t.is_migrated, ps.price_sol
      ORDER BY max(tr.timestamp) DESC
    `;
    const launched = await sql`
      SELECT mint, ticker, name, is_migrated AS "isMigrated", ath FROM tokens WHERE creator = ${w} ORDER BY created_at DESC
    `;
    return { positions: rows, launched };
  });

  // Creator fees are paid to the creator's wallet on every trade, so this is
  // a statement, not a claim queue (presale creator tokens are the exception).
  app.get('/creator/rewards', async (req) => {
    const { wallet: w } = z.object({ wallet }).parse(req.query);
    const rows = await sql`
      SELECT t.mint, t.ticker, t.name, t.pool_type AS "poolType", t.is_migrated AS "isMigrated",
             coalesce(sum(tr.fee_creator), 0)::float8 AS "feesSol",
             coalesce(sum(tr.fee_creator) FILTER (WHERE tr.timestamp > NOW() - INTERVAL '24 hours'), 0)::float8 AS "fees24hSol",
             count(tr.*)::int AS trades
      FROM tokens t LEFT JOIN trades tr ON tr.mint = t.mint
      WHERE t.creator = ${w}
      GROUP BY t.mint, t.ticker, t.name, t.pool_type, t.is_migrated
      ORDER BY "feesSol" DESC
    `;
    const total = rows.reduce((s, r) => s + Number(r.feesSol), 0);
    return { tokens: rows, totalSol: total };
  });
};
