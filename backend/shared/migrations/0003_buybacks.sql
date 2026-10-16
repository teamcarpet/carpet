-- ────────────────────────────────────────────────────────────────────────
-- Buyback-and-burn history (BuybackExecuted events).
-- Idempotent: safe to re-run.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS buybacks (
  signature        text NOT NULL,
  pool             text NOT NULL,
  mint             text NOT NULL,
  sol_spent        double precision NOT NULL,
  tokens_burned    double precision NOT NULL,
  round_number     smallint NOT NULL DEFAULT 0,
  total_rounds     smallint NOT NULL DEFAULT 0,
  timestamp        timestamptz NOT NULL,
  slot             bigint NOT NULL,
  PRIMARY KEY (signature, pool)
);
CREATE INDEX IF NOT EXISTS buybacks_mint_time_idx ON buybacks (mint, timestamp DESC);
