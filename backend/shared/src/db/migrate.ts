import postgres from 'postgres';
import 'dotenv/config';
import { runMigrations } from './migrate-runner.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
console.log('Running migrations…');
await runMigrations(sql);
console.log('✓ Migrations applied');
await sql.end();
process.exit(0);
