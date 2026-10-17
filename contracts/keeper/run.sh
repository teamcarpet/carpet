#!/bin/bash
# Three keeper jobs in one container; if any loop dies the container exits
# and Docker restarts it.
set -u
export ANCHOR_WALLET=/run/secrets/keeper.json
export ANCHOR_PROVIDER_URL="${SOLANA_RPC_URL}"
export MIGRATION_STATE_FILE=/data/migrations.json

KEEPER_MODE=loop POLL_INTERVAL_MS=30000 node scripts/keeper_auto_migrate.js &
KEEPER_MODE=loop POLL_INTERVAL_MS=15000 node scripts/keeper_buyback.js &
( while true; do node scripts/keeper_claim_lp_fees.js; sleep "${LP_FEES_INTERVAL_S:-600}"; done ) &

wait -n
exit 1
