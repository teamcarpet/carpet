# Solana Launchpad

Anchor/Rust smart contract implementing a token launchpad with two modes — **Bonding Curve** and **Presale** — with migration to **Meteora DAMM v2**.

## Deployment

- Version: `v0.1-devnet-final`
- Network: `Devnet`
- Program ID: `DywpVp5YfLiX4M3xfEp333Y2dmq8xywdNAYaWDw6v9XV`

## Features

| Parameter | Bonding Curve | Presale |
|-----------|--------------|---------|
| Migration Target | 100 SOL | 100–10,000 SOL |
| Max Buy | 1% per wallet (cumulative) | 1% per wallet |
| Buy Fee | 1% (0.5% dev + 0.5% platform) | 1% platform |
| Sell Fee | 1% (0.5% creator + 0.5% platform) + 24% sell tax → buyback | Sell blocked until migration |
| Token Lock | No lock | Full lock until pool creation |
| Entry Price | Constant product (pump.fun style) | Equal for all |
| If target not reached | — | Full refund |
| Migration Liquidity | 80% → Meteora DAMM | 20% → Meteora DAMM |
| Migration Buyback | Fixed burn-only buyback from treasury | 60% scheduled burn-only buyback |

## Project structure

```
programs/launchpad/src/
  lib.rs                    — program entrypoint
  state/                    — 5 state accounts
  instructions/             — 14 instructions
  math/                     — bonding curve + fees
  cpi_meteora.rs            — Meteora DAMM v2 CPI
  errors.rs / events.rs
tests/
  launchpad.ts              — 16 integration tests
```

## Security

Audited against standard Solana launchpad risk checklists. Current hardening includes:

- keeper-only buyback execution with global pause support
- pool-level pause support for both bonding and presale pools
- 1% anti-whale caps on bonding and presale participation
- Meteora LP position NFT custody locked to the Meteora `position_nft_account` PDA with Token-2022 post-validation
- migration activation delay and configurable Meteora account/config validation
- creator token claims and LP-fee routing locked to validated destinations
- sell-side slippage protection includes expected sell-tax matching
- no vanity mint suffix requirement for launchpad pools

### Audit-ready patterns

- `checked_add/sub/mul/div` everywhere, u128 intermediates
- Checks-Effects-Interactions in every instruction
- Anchor constraints for all account validation
- Fixed-length PDA seeds with unique prefixes, canonical bumps only
- `Signer<'info>` for all privileged operations
- Two-step admin transfer (`propose_admin` → `accept_admin`)
- Rate-limited buybacks (10 slot cooldown)
- Global + per-pool pause mechanism
- Event emission for all state changes

## Build

```bash
anchor build
```

Pinned to Anchor 0.31.1 (`anchor-cli`, `anchor-lang`, `anchor-spl`).

## Test

```bash
anchor test
```

The local Rust/unit suite passes on localnet. `anchor test` may still depend on host-local validator/process state in some macOS environments.

Designed for Devnet iteration before any immutable mainnet deployment.

## Meteora DAMM v2 integration

CPI calls constructed manually (no published Meteora crate) using instruction discriminators from the on-chain IDL:
- `initialize_pool`: `[95, 180, 10, 172, 84, 174, 232, 40]`
- `swap`: `[248, 198, 158, 145, 225, 117, 135, 200]`

Meteora program ID: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`

Meteora position NFT custody uses the Meteora PDA model:
- `position_nft_account = PDA(["position_nft_account", position_nft_mint], METEORA_PROGRAM_ID)`
- post-migration validation confirms Token-2022 mint, token owner, and amount

Allowed Meteora pool configs are stored in `GlobalConfig.allowed_meteora_configs` and validated during migration.

## Mainnet operational note

Before mainnet:
- transfer upgrade authority to a Squads multisig with a timelock, or
- deploy the program immutable once beta changes are finished

Recommended path:
- multisig + timelock during beta
- immutable deployment after final verification, including real Meteora devnet migration coverage

## License

MIT
