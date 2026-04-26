import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) {
  // eslint-disable-next-line no-console
  console.error('DATABASE_URL not set — db client cannot initialize.');
  process.exit(1);
}

/**
 * Single connection pool for the whole process.
 * `max: 10` — Railway's default Postgres allows 100 conns; with 3 services
 * (indexer, api, ws) staying well under is the safe budget.
 *
 * `transform: { undefined: null }` — Postgres treats undefined in inserts
 * as NULL, but the default behaviour throws. We want NULL so optional
 * fields work naturally in TS.
 */
export const sql = postgres(url, {
  max:  10,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: { undefined: null },
});

export const db = drizzle(sql, { schema });

export type Db = typeof db;
