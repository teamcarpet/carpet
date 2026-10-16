-- ────────────────────────────────────────────────────────────────────────
-- Real holder counts (non-zero wallets, program vaults excluded),
-- refreshed by the indexer. Idempotent.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE tokens ADD COLUMN IF NOT EXISTS holders            integer NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS holders_updated_at timestamptz;
