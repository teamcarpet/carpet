-- ────────────────────────────────────────────────────────────────────────
-- Pre-ground mint keypairs whose address ends with the brand suffix ("rug").
-- The API grinds them in the background and hands one out per launch, so the
-- browser never has to brute-force a vanity address itself.
-- A mint keypair only signs its own account creation; once the mint exists
-- the secret has no power, so handing it to the launching wallet is safe.
-- Idempotent: safe to re-run.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vanity_mints (
  pubkey      text PRIMARY KEY,
  secret      bytea NOT NULL,
  suffix      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  claimed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS vanity_mints_free_idx ON vanity_mints (suffix, created_at) WHERE claimed_at IS NULL;
