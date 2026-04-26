# CARPET Smart Contract Patch — v2

## What changed

Scheduled-round buyback mechanics for presale pools.

## Summary

Previously: one-shot buyback logic. Each `execute_buyback` call spent 60%
of whatever was left in treasury, with only a slot-based cooldown. No
notion of rounds, modes, or schedule.

Now: two explicit presale modes chosen at pool creation. Each pool gets
a fixed round count, interval, and per-round BPS.

### Mode A — Regular
- 6 rounds × 10% = **60% burned over 24 hours**
- Interval: 4 hours between rounds
- Off-chain bot cranks once per 4h

### Mode B — Extreme
- 12 rounds × 5% = **60% burned over 6 hours**
- Interval: 30 minutes between rounds
- Bot cranks once per 30min

Both modes burn the same total (60% of initial treasury). Difference is
only the pace.

## Math check

### Regular
| Round | Time   | Spend              | Cumulative |
|-------|--------|--------------------|------------|
| 1     | t+0    | 10% of initial     | 10%        |
| 2     | t+4h   | 10% of initial     | 20%        |
| 3     | t+8h   | 10% of initial     | 30%        |
| 4     | t+12h  | 10% of initial     | 40%        |
| 5     | t+16h  | 10% of initial     | 50%        |
| 6     | t+20h  | 10% of initial     | 60%        |

### Extreme
12 × 5% = 60% burned in 5h 30min (rounds fire at t+0, t+30m, t+60m, ..., t+5h30m).

Key detail: each round spends `bps_per_round × initial_treasury`, NOT
`bps_per_round × current_balance`. Storing `initial_treasury` at migration
time fixes the base, so rounds are uniform absolute amounts. Without this,
rounds would decay geometrically.

## Files changed

```
programs/launchpad/src/state/presale_pool.rs
  + PresaleMode enum (Regular / Extreme)
  + helper methods: total_rounds, bps_per_round, round_interval_seconds
  + presale_mode field on PresalePool

programs/launchpad/src/state/buyback.rs
  + initial_treasury, last_buyback_ts, total_rounds, rounds_executed,
    bps_per_round, round_interval_seconds on BuybackState
  + ROUND_GRACE_SECONDS constant (30s bot-clock tolerance)
  - PRESALE_BUYBACK_BPS constant (no longer used)

programs/launchpad/src/instructions/create_presale_pool.rs
  + presale_mode param, written to pool state
  + token_supply bounds (1M..1e18)

programs/launchpad/src/instructions/migrate_presale.rs
  + copies presale_mode → BuybackState schedule fields
  + seeds initial_treasury = buyback_sol

programs/launchpad/src/instructions/migrate_bonding.rs
  + initializes new BuybackState fields (all zero for bonding)

programs/launchpad/src/instructions/execute_buyback.rs
  * handler split by pool_type (0 = bonding legacy, 1 = presale scheduled)
  * presale path: enforces rounds_executed < total_rounds and time gate
    against last_buyback_ts + round_interval_seconds
  * presale amount: bps_per_round × initial_treasury (uniform rounds)
  * bumps rounds_executed after each presale execution
  * clamps spend to min(amount, treasury_balance) as safety

programs/launchpad/src/errors.rs
  + AllRoundsExecuted, RoundNotDue

programs/launchpad/src/events.rs
  + BuybackExecuted now carries round_number + total_rounds

tests/launchpad.ts
  + createPresalePool test passes presaleMode: { regular: {} }
```

## Off-chain bot — what it does

Crank schedule:
```
every 60s:
  for each BuybackState account (pool_type == 1):
    if rounds_executed >= total_rounds: skip
    due_at = last_buyback_ts + round_interval_seconds
    if now >= due_at - 30s (grace):
      build execute_buyback tx
      sign with bot keypair
      send to RPC
      log result
```

Permissionless design — if your bot dies, anyone can still crank. Contract
enforces all rules on-chain, bot is just a timer.

## Security notes still applying

The remaining items from the audit are NOT fixed in this patch:
- LP position lock after migration (admin can remove liquidity)
- freeze_authority check on mint at create-pool
- Sybil resistance on max-buy (needs oracle verify-to-buy)
- Presale overshoot handling (raises beyond target still accepted)
- Meteora activation_point delay (snipe protection)

These should be addressed before mainnet. This patch only implements the
round-based buyback schedule you asked for.

## Backward compat

Breaking change to IDL: `CreatePresalePoolParams` now has a required
`presaleMode` field. `BuybackState` account layout changed — old
pools would need migration, but if nothing is deployed yet, just redeploy.
