import postgres from 'postgres';
import * as schema from './schema.js';
/**
 * Single connection pool for the whole process.
 * `max: 10` — Railway's default Postgres allows 100 conns; with 3 services
 * (indexer, api, ws) staying well under is the safe budget.
 *
 * `transform: { undefined: null }` — Postgres treats undefined in inserts
 * as NULL, but the default behaviour throws. We want NULL so optional
 * fields work naturally in TS.
 */
export declare const sql: postgres.Sql<{}>;
export declare const db: import("drizzle-orm/postgres-js").PostgresJsDatabase<typeof schema> & {
    $client: postgres.Sql<{}>;
};
export type Db = typeof db;
