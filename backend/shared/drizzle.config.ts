import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema:  './src/db/schema.ts',
  out:     './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://carpet:carpet@localhost:5432/carpet',
  },
  verbose: true,
  strict:  true,
});
