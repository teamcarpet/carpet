import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';

// Applies shared/migrations/*.sql in name order, once each. Statements run one
// by one outside a transaction because TimescaleDB continuous aggregates can't
// be created inside one. Every migration is written to be idempotent, so a
// crash halfway is fixed by simply running again.

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

export function splitStatements(source: string): string[] {
  const withoutComments = source
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(/;\s*(?:\n|$)/)
    .map(s => s.trim())
    .filter(Boolean);
}

export async function runMigrations(sql: Sql, log: (msg: string) => void = console.log): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT NOW()
    )
  `;
  // One migrator at a time across services/replicas.
  await sql`SELECT pg_advisory_lock(727274)`;
  try {
    const applied = new Set((await sql`SELECT name FROM schema_migrations`).map(r => r.name as string));
    const files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const statements = splitStatements(await readFile(MIGRATIONS_DIR + file, 'utf8'));
      log(`applying ${file} (${statements.length} statements)`);
      for (const statement of statements) await sql.unsafe(statement);
      await sql`INSERT INTO schema_migrations (name) VALUES (${file})`;
    }
  } finally {
    await sql`SELECT pg_advisory_unlock(727274)`;
  }
}
