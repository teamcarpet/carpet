# Security Fixes

This document summarizes the main security and correctness fixes applied in the launchpad program during the current audit pass.

## Fixed

1. Anti-whale bonding cap
- Set `max_buy_bps` back to `100` (1%) in bonding pool creation.
- Files:
  - `programs/launchpad/src/instructions/create_bonding_pool.rs`

2. LP position NFT custody
- Bound `position_nft_account` to the ATA for `lp_custody` and `position_nft_mint`.
- Added post-migration checks that the LP NFT token account authority is `lp_custody` and its amount is `1`.
- Files:
  - `programs/launchpad/src/instructions/migrate_bonding.rs`
  - `programs/launchpad/src/instructions/migrate_presale.rs`

3. Meteora activation delay
- Replaced immediate activation with `Clock::get()?.slot + ACTIVATION_DELAY_SLOTS`.
- Default delay is `150` slots.
- Files:
  - `programs/launchpad/src/state/config.rs`
  - `programs/launchpad/src/instructions/migrate_bonding.rs`
  - `programs/launchpad/src/instructions/migrate_presale.rs`

4. Bonding trading lock at target
- Bonding buys now reject once `real_sol_reserves >= migration_target`.
- Bonding sells now reject once `real_sol_reserves >= migration_target`.
- Files:
  - `programs/launchpad/src/errors.rs`
  - `programs/launchpad/src/instructions/buy_bonding.rs`
  - `programs/launchpad/src/instructions/sell_bonding.rs`

5. Bonding leftover token handling
- Bonding migration now sends all remaining tokens into LP instead of leaving a 20% remainder in the token vault.
- Added a post-migration check that the vault is empty.
- Files:
  - `programs/launchpad/src/instructions/migrate_bonding.rs`

6. UserPosition semantics
- Renamed `sol_contributed` to `amount`.
- Bonding uses `amount` for cumulative tokens bought.
- Presale uses `amount` for SOL contributed.
- Files:
  - `programs/launchpad/src/state/user_position.rs`
  - `programs/launchpad/src/instructions/buy_bonding.rs`
  - `programs/launchpad/src/instructions/contribute_presale.rs`
  - `programs/launchpad/src/instructions/claim_presale.rs`
  - `programs/launchpad/src/instructions/refund_presale.rs`

7. Buyback caller hardening
- Restricted `execute_buyback` to the configured keeper wallet.
- Kept nonzero `min_tokens_out`, spend caps, cooldowns, fixed vault routing, and burn-only post-action.
- Files:
  - `programs/launchpad/src/instructions/execute_buyback.rs`

8. Sell reserve accounting
- Updated sell-side reserve reduction to keep sell-tax SOL inside pool accounting.
- Files:
  - `programs/launchpad/src/instructions/sell_bonding.rs`

9. Safe pool creator parsing
- Replaced raw byte-offset creator parsing with discriminator-based deserialization for bonding and presale pools.
- Files:
  - `programs/launchpad/src/instructions/claim_lp_fees.rs`

10. Global pause coverage
- Added `config.is_paused` enforcement to:
  - `execute_buyback`
  - `claim_lp_fees`
  - `harvest_and_split_lp_fees`
  - `split_claimed_fees`
  - `claim_presale`
  - `refund_presale`
  - `claim_creator_tokens`
- Files:
  - `programs/launchpad/src/instructions/execute_buyback.rs`
  - `programs/launchpad/src/instructions/claim_lp_fees.rs`
  - `programs/launchpad/src/instructions/claim_presale.rs`
  - `programs/launchpad/src/instructions/refund_presale.rs`
  - `programs/launchpad/src/instructions/claim_creator_tokens.rs`

11. Pool-level pause controls
- Added `pause_bonding_pool` and `unpause_bonding_pool`.
- Added `pause_presale_pool` and `unpause_presale_pool`.
- Files:
  - `programs/launchpad/src/instructions/admin.rs`
  - `programs/launchpad/src/lib.rs`
  - `programs/launchpad/src/state/presale_pool.rs`
  - `programs/launchpad/src/instructions/create_presale_pool.rs`
  - `programs/launchpad/src/instructions/contribute_presale.rs`
  - `programs/launchpad/src/instructions/claim_presale.rs`
  - `programs/launchpad/src/instructions/refund_presale.rs`
  - `programs/launchpad/src/instructions/migrate_presale.rs`
  - `programs/launchpad/src/instructions/claim_creator_tokens.rs`

12. Bonding buyback base
- Bonding buybacks now spend from `initial_treasury` as the fixed basis and cap by remaining `treasury_balance`.
- Files:
  - `programs/launchpad/src/instructions/execute_buyback.rs`

13. Burn-only buyback mode
- `BuybackMode` is burn-only and has no live `AddLiquidity` branch.
- Files:
  - `programs/launchpad/src/state/buyback.rs`
  - `programs/launchpad/src/instructions/execute_buyback.rs`

14. Meteora account validation
- Enforced derived Meteora event authority checks.
- Whitelisted the allowed Meteora pool config address.
- Files:
  - `programs/launchpad/src/state/config.rs`
  - `programs/launchpad/src/instructions/migrate_bonding.rs`
  - `programs/launchpad/src/instructions/migrate_presale.rs`
  - `programs/launchpad/src/instructions/execute_buyback.rs`

15. Refund cleanup
- Refund path now zeroes the position amount after refund.
- Files:
  - `programs/launchpad/src/instructions/refund_presale.rs`

16. Virtual token validation
- Bonding creation now requires `virtual_tokens == token_supply`.
- Files:
  - `programs/launchpad/src/instructions/create_bonding_pool.rs`

## Files Changed In Final Cleanup

- `programs/launchpad/src/errors.rs`
- `programs/launchpad/src/state/presale_pool.rs`
- `programs/launchpad/src/instructions/create_presale_pool.rs`
- `programs/launchpad/src/instructions/contribute_presale.rs`
- `programs/launchpad/src/instructions/claim_presale.rs`
- `programs/launchpad/src/instructions/refund_presale.rs`
- `programs/launchpad/src/instructions/claim_creator_tokens.rs`
- `programs/launchpad/src/instructions/migrate_presale.rs`
- `programs/launchpad/src/instructions/execute_buyback.rs`
- `programs/launchpad/src/instructions/admin.rs`
- `programs/launchpad/src/lib.rs`
- `tests/launchpad.ts`
- `README.md`

## Tests Added or Updated

- Max buy set to 1%
- Cannot buy after migration target
- Cannot sell after migration target
- LP custody ATA differs from payer ATA
- Migration activation delay
- Keeper-only buyback caller
- Buyback rejects execution while globally paused
- Bonding buyback uses `initial_treasury` and caps by remaining balance
- No stale `AddLiquidity` buyback branch
- Refund resets position amount
- Bonding migration now uses all remaining tokens
- Presale pool pause toggle
- Presale pool paused-state guard helper
- Anchor integration tests updated for current presale layout and entrypoints

## Verification

- `cargo test --manifest-path programs/launchpad/Cargo.toml`
- `cargo clippy --manifest-path programs/launchpad/Cargo.toml -- -D warnings`
- `cargo fmt --manifest-path programs/launchpad/Cargo.toml --all`
- `anchor build`
- `anchor test`

## Remaining Assumptions

- Buyback remains intentionally burn-only.
- Presale account sizing is now pinned explicitly via `PresalePool::SPACE`.
- The local Anchor suite is green; CI should still run the same commands in a clean environment before mainnet.
