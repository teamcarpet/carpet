-- ────────────────────────────────────────────────────────────────────────
-- Token metadata from Metaplex + real-time candles.
-- Idempotent: safe to re-run.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE tokens ADD COLUMN IF NOT EXISTS description   text;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS website       text;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS twitter       text;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS telegram      text;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS metadata_uri  text;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS supply        double precision NOT NULL DEFAULT 1000000000;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS metadata_ok   boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS tokens_metadata_pending_idx ON tokens (metadata_ok) WHERE metadata_ok = false;

-- Continuous aggregates only return materialized buckets by default, which
-- left the newest candle minutes behind. Real-time mode unions in raw trades
-- newer than the last materialization.
ALTER MATERIALIZED VIEW candles_1m  SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW candles_5m  SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW candles_15m SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW candles_1h  SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW candles_4h  SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW candles_1d  SET (timescaledb.materialized_only = false);
