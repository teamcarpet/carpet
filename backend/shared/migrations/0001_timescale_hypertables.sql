-- ────────────────────────────────────────────────────────────────────────
-- CARPET initial schema + TimescaleDB hypertables
-- All tables + extension + continuous aggregates in one file.
-- Idempotent: safe to re-run.
-- ────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ── Tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tokens (
  mint           text PRIMARY KEY,
  ticker         text NOT NULL,
  name           text NOT NULL,
  image_url      text,
  creator        text NOT NULL,
  pool_type      text NOT NULL,
  pool_address   text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  is_migrated    boolean NOT NULL DEFAULT false,
  meteora_pool   text,
  ath            double precision NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tokens_pool_idx    ON tokens (pool_address);
CREATE INDEX IF NOT EXISTS tokens_creator_idx ON tokens (creator);

CREATE TABLE IF NOT EXISTS trades (
  signature     text NOT NULL,
  mint          text NOT NULL,
  pool          text NOT NULL,
  account       text NOT NULL,
  side          text NOT NULL,
  amount_sol    double precision NOT NULL,
  amount_token  double precision NOT NULL,
  price_usd     double precision,
  price_sol     double precision NOT NULL,
  fee_platform  double precision NOT NULL DEFAULT 0,
  fee_creator   double precision NOT NULL DEFAULT 0,
  sell_tax      double precision NOT NULL DEFAULT 0,
  timestamp     timestamptz NOT NULL,
  slot          bigint NOT NULL,
  PRIMARY KEY (signature, mint, timestamp)
);
CREATE INDEX IF NOT EXISTS trades_mint_time_idx ON trades (mint, timestamp DESC);
CREATE INDEX IF NOT EXISTS trades_account_idx   ON trades (account);

CREATE TABLE IF NOT EXISTS pool_state (
  pool              text PRIMARY KEY,
  mint              text NOT NULL,
  total_raised_sol  double precision NOT NULL DEFAULT 0,
  migration_target  double precision NOT NULL DEFAULT 100,
  progress_pct      double precision NOT NULL DEFAULT 0,
  reserve_sol       double precision NOT NULL DEFAULT 0,
  reserve_token     double precision NOT NULL DEFAULT 0,
  price_sol         double precision NOT NULL DEFAULT 0,
  price_usd         double precision,
  market_cap        double precision NOT NULL DEFAULT 0,
  is_migrated       boolean NOT NULL DEFAULT false,
  last_updated      timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pool_state_mint_idx ON pool_state (mint);

CREATE TABLE IF NOT EXISTS presale_state (
  pool              text PRIMARY KEY,
  mint              text NOT NULL,
  mode              smallint NOT NULL,
  total_rounds      smallint NOT NULL,
  current_round     smallint NOT NULL DEFAULT 0,
  start_time        timestamptz NOT NULL,
  end_time          timestamptz NOT NULL,
  total_raised_sol  double precision NOT NULL DEFAULT 0,
  contributors      integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS indexer_cursor (
  id          text PRIMARY KEY,
  last_slot   bigint NOT NULL DEFAULT 0,
  last_sig    text,
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

-- ── Convert trades to hypertable ─────────────────────────────────────────
SELECT create_hypertable(
  'trades',
  'timestamp',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists       => TRUE,
  migrate_data        => TRUE
);

-- ── Continuous aggregates: candles per resolution ────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1m
WITH (timescaledb.continuous) AS
SELECT
  mint,
  time_bucket(INTERVAL '1 minute', timestamp) AS bucket,
  first(price_sol, timestamp) AS open,
  max(price_sol)              AS high,
  min(price_sol)              AS low,
  last(price_sol, timestamp)  AS close,
  sum(amount_token)           AS volume,
  count(*)::int               AS trades
FROM trades
GROUP BY mint, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_1m',
  start_offset      => INTERVAL '5 minutes',
  end_offset        => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists     => TRUE
);

CREATE MATERIALIZED VIEW IF NOT EXISTS candles_5m
WITH (timescaledb.continuous) AS
SELECT
  mint,
  time_bucket(INTERVAL '5 minutes', timestamp) AS bucket,
  first(price_sol, timestamp) AS open,
  max(price_sol)              AS high,
  min(price_sol)              AS low,
  last(price_sol, timestamp)  AS close,
  sum(amount_token)           AS volume,
  count(*)::int               AS trades
FROM trades
GROUP BY mint, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_5m',
  start_offset      => INTERVAL '20 minutes',
  end_offset        => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists     => TRUE
);

CREATE MATERIALIZED VIEW IF NOT EXISTS candles_15m
WITH (timescaledb.continuous) AS
SELECT
  mint,
  time_bucket(INTERVAL '15 minutes', timestamp) AS bucket,
  first(price_sol, timestamp) AS open,
  max(price_sol)              AS high,
  min(price_sol)              AS low,
  last(price_sol, timestamp)  AS close,
  sum(amount_token)           AS volume,
  count(*)::int               AS trades
FROM trades
GROUP BY mint, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_15m',
  start_offset      => INTERVAL '1 hour',
  end_offset        => INTERVAL '15 minutes',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists     => TRUE
);

CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1h
WITH (timescaledb.continuous) AS
SELECT
  mint,
  time_bucket(INTERVAL '1 hour', timestamp) AS bucket,
  first(price_sol, timestamp) AS open,
  max(price_sol)              AS high,
  min(price_sol)              AS low,
  last(price_sol, timestamp)  AS close,
  sum(amount_token)           AS volume,
  count(*)::int               AS trades
FROM trades
GROUP BY mint, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_1h',
  start_offset      => INTERVAL '4 hours',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE
);

CREATE MATERIALIZED VIEW IF NOT EXISTS candles_4h
WITH (timescaledb.continuous) AS
SELECT
  mint,
  time_bucket(INTERVAL '4 hours', timestamp) AS bucket,
  first(price_sol, timestamp) AS open,
  max(price_sol)              AS high,
  min(price_sol)              AS low,
  last(price_sol, timestamp)  AS close,
  sum(amount_token)           AS volume,
  count(*)::int               AS trades
FROM trades
GROUP BY mint, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_4h',
  start_offset      => INTERVAL '16 hours',
  end_offset        => INTERVAL '4 hours',
  schedule_interval => INTERVAL '4 hours',
  if_not_exists     => TRUE
);

CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1d
WITH (timescaledb.continuous) AS
SELECT
  mint,
  time_bucket(INTERVAL '1 day', timestamp) AS bucket,
  first(price_sol, timestamp) AS open,
  max(price_sol)              AS high,
  min(price_sol)              AS low,
  last(price_sol, timestamp)  AS close,
  sum(amount_token)           AS volume,
  count(*)::int               AS trades
FROM trades
GROUP BY mint, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_1d',
  start_offset      => INTERVAL '4 days',
  end_offset        => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists     => TRUE
);

-- ── Compression policy on trades ─────────────────────────────────────────
ALTER TABLE trades SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'mint',
  timescaledb.compress_orderby   = 'timestamp DESC'
);

SELECT add_compression_policy('trades', INTERVAL '7 days', if_not_exists => TRUE);

-- ── Initial cursor row ───────────────────────────────────────────────────
INSERT INTO indexer_cursor (id, last_slot)
VALUES ('main', 0)
ON CONFLICT (id) DO NOTHING;