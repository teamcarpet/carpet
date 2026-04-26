import type { FastifyPluginAsync } from 'fastify';
import { sql } from '@carpet/shared/db';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, reply) => {
    try {
      await sql`SELECT 1`;
      return { ok: true, ts: Date.now() };
    } catch (err) {
      reply.code(503);
      return { ok: false, error: (err as Error).message };
    }
  });
};
