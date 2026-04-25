<div align="center">

```
   ▄████▄   ▄▄▄       ██▀███   ██▓███  ▓█████▄▄▄█████▓
  ▒██▀ ▀█  ▒████▄    ▓██ ▒ ██▒▓██░  ██▒▓█   ▀▓  ██▒ ▓▒
  ▒▓█    ▄ ▒██  ▀█▄  ▓██ ░▄█ ▒▓██░ ██▓▒▒███  ▒ ▓██░ ▒░
  ▒▓▓▄ ▄██▒░██▄▄▄▄██ ▒██▀▀█▄  ▒██▄█▓▒ ▒▒▓█  ▄░ ▓██▓ ░
  ▒ ▓███▀ ░ ▓█   ▓██▒░██▓ ▒██▒▒██▒ ░  ░░▒████▒ ▒██▒ ░
  ░ ░▒ ▒  ░ ▒▒   ▓▒█░░ ▒▓ ░▒▓░▒▓▒░ ░  ░░░ ▒░ ░ ▒ ░░
    ░  ▒     ▒   ▒▒ ░  ░▒ ░ ▒░░▒ ░      ░ ░  ░   ░
  ░          ░   ▒     ░░   ░ ░░          ░    ░
  ░ ░            ░  ░   ░                 ░  ░
```

### `// Every token deserves a red carpet moment`

**Solana token launchpad with bonding curves, presale modes, and on-chain buybacks**

[![Solana](https://img.shields.io/badge/Built_on-Solana-9945FF?style=flat-square&labelColor=14F195&logo=solana&logoColor=black)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.30-blue?style=flat-square)](https://www.anchor-lang.com/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Node](https://img.shields.io/badge/Node-18+-43853d?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Network](https://img.shields.io/badge/network-devnet-yellow?style=flat-square)](https://explorer.solana.com/?cluster=devnet)

[**Live demo →**](https://incredible-licorice-3f90ec.netlify.app) &nbsp;·&nbsp; [Domain](https://carpet.fun) &nbsp;·&nbsp; [Smart Contract](#smart-contracts) &nbsp;·&nbsp; [Architecture](#architecture)

</div>

---

## `// what is this`

CARPET is a Solana-based token launchpad designed to give every project a fair, transparent path from launch to liquidity. It combines the speed of memecoin launches with mechanics borrowed from serious tokenomics — buybacks, presale rounds, anti-bot gating, and migration to permanent AMM liquidity.

Unlike pump-and-dump platforms where 99% of tokens go to zero in hours, CARPET is built around **value retention loops**: every trade fee feeds the buyback treasury, every presale round burns tokens, and every migration locks LP into Meteora's permissionless DAMM v2 with concentrated liquidity.

```
> launch          → choose curve type, configure presale (optional)
> bond            → trade on the bonding curve, 1% max wallet, 24% sell tax
> migrate         → at 100 SOL raised, auto-migrate to Meteora DAMM v2
> buyback         → contract permanently burns or compounds via LP
```

---

## `// why CARPET`

CARPET doesn't try to be the next pump.fun. It exists because every existing launchpad makes one of these compromises, and CARPET refuses all of them.

| Problem on other launchpads | What CARPET does instead |
| :--- | :--- |
| **Bot snipers drain new launches in seconds** | Twitter verify-to-buy gate (planned), 1% max-wallet enforced on-chain, 3-hour token lock post-purchase |
| **No way to reward early supporters fairly** | Two presale modes — Regular (6 rounds × 10%, 24h) and Extreme (20 rounds × 5%, ~100min). Equal entry. No whales. |
| **Sell pressure murders tokens at 1k MC** | 24% sell tax on bonding curve, 100% routed to buyback treasury. Sellers pay for buybacks. |
| **Fake graduations, rugged LPs** | Migration to Meteora DAMM v2 is on-chain, atomic, and irreversible. LP tokens locked to program PDA. |
| **No yield for creators or platform** | Meteora DAMM v2 trading fees keep accruing post-migration. The program holds the LP NFT and routes accrued fees back through the buyback / platform / creator treasury structure |
| **Closed black-box pricing** | Fully open bonding curve formula, on-chain state, anyone can audit live treasury balance |

The thesis: **a launchpad should make every actor better off** — creators, traders, and the platform — not just the platform.

---

## `// status`

```yaml
network:           devnet (mainnet: pending audit)
program_id:        DywpVp5YfLiX4M3xfEp333Y2dmq8xywdNAYaWDw6v9XV
test_tokens:       3 deployed on devnet
last_updated:      2026-04-25
```

| Component | Status | Notes |
| :--- | :---: | :--- |
| Frontend (Vite + vanilla JS) | `[done]` | Full UI — home, launch, bubble map, token detail |
| Mobile responsive | `[done]` | iPhone SE baseline, bottom tab bar, fixed CTA sheet |
| Smart contracts (Rust / Anchor) | `[done]` | `carpet_presale.rs` + `carpet_bonding.rs` written |
| Bonding curve mechanics | `[tested]` | Devnet, 3 test tokens through full lifecycle |
| Presale (Regular + Extreme) | `[tested]` | Both round schedules verified |
| Migration to Meteora DAMM v2 | `[tested]` | CPI integration, LP NFT lock to PDA |
| Token detail page | `[done]` | pump.fun-style layout, market card, holders, trades |
| Bubble Map (holder graph) | `[done]` | d3-force canvas, Helius integration |
| Smart contract deployment to mainnet | `[pending]` | After audit |
| TradingView Charting Library | `[pending]` | Awaiting TV team approval |
| Backend indexer (api.carpet.fun) | `[planned]` | Geyser → Postgres → REST/WS |
| Real-time trades stream | `[deferred]` | Phase 2 |
| Twitter verify-to-buy | `[deferred]` | Phase 2 |
| Off-chain buyback crank bot | `[planned]` | Permissionless, ~150 LOC TS |

`[done]` complete &nbsp;·&nbsp; `[tested]` working on devnet &nbsp;·&nbsp; `[pending]` blocked on external &nbsp;·&nbsp; `[planned]` next sprint &nbsp;·&nbsp; `[deferred]` post-mainnet

---

## `// tokenomics`

Every CARPET launch operates as a **closed value system**: tokens enter through presale or bonding, exit through trades, and the contract programmatically routes a portion of every flow back into buybacks.

### Trade fees and routing

```
                   ┌─────────────────┐
                   │   USER BUYS     │
                   │   X SOL worth   │
                   └────────┬────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
        1% fee          tokens out       reserve in
          │                 │                 │
          ▼                                   ▼
   ┌──────────────┐                  ┌────────────────┐
   │   PLATFORM   │                  │  CURVE RESERVE │
   │  (revenue)   │                  │   (bonding)    │
   └──────────────┘                  └────────────────┘
```

```
                   ┌─────────────────┐
                   │   USER SELLS    │
                   │  Y tokens worth │
                   └────────┬────────┘
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
   1% platform fee       SOL out            24% sell tax
       │                    │                    │
       ▼                                         ▼
                                       ┌────────────────────┐
                                       │  BUYBACK TREASURY  │
                                       │  (auto-buys+burns) │
                                       └────────────────────┘
```

### Migration splits (at 100 SOL raised)

CARPET has **two distinct migration paths** depending on launch type. Each routes the raised reserve differently.

**Bonding curve migration:**

```
┌──────────────────────────────────────────────────┐
│         BONDING RESERVE: 100 SOL                 │
├──────────────────────────────────────────────────┤
│  ████████████████████████████████  80% LP        │  → Meteora DAMM v2, LP locked to PDA
│  ███████                           19% + tax     │  → Buyback treasury (+ accumulated 24% sell tax)
│                                     1% PLT       │  → Platform revenue
└──────────────────────────────────────────────────┘
```

**Presale migration:**

```
┌──────────────────────────────────────────────────┐
│         PRESALE RESERVE: 100 SOL                 │
├──────────────────────────────────────────────────┤
│  ████████                          20% LP        │  → Meteora DAMM v2, LP locked to PDA
│  ████████                          20% CRT       │  → Creator wallet
│  ████████████████████████          59% BBK       │  → Buyback treasury
│                                     1% PLT       │  → Platform revenue
└──────────────────────────────────────────────────┘
```

The **bonding split** prioritizes deep liquidity — 80% goes to LP. The buyback treasury also inherits all accumulated 24% sell tax from the curve phase, so it usually comes in larger than the headline 19%.

The **presale split** rewards the creator (20%) and front-loads the buyback treasury (59%) for sustained post-launch buying pressure. Less LP, but presale tokens enter with locked supply already distributed.

### Buyback flow

Treasury accumulation does nothing on its own. The contract converts it to value via `execute_buyback()`:

```
treasury SOL  ───►  market buy on the pool  ───►  tokens to PDA  ───►  burn()
```

Permissionless — anyone can call it. Off-chain crank bot will run it automatically post-mainnet, but the contract doesn't depend on any privileged caller.

### Presale modes

Both modes raise into the same treasury, both burn 60% of unsold supply at the end of the raise.

| Parameter | Regular | Extreme |
| :--- | :---: | :---: |
| Total rounds | 6 | 20 |
| Per-round allocation | 10% supply | 5% supply |
| Round interval | 4 hours | 5 minutes |
| Total duration | 24 hours | ~100 minutes |
| Equal entry per round | yes | yes |
| Treasury burn at end | 60% | 60% |
| Migration to Meteora | automatic | automatic |

Equal-entry per round means whales can't snipe rounds with bigger SOL — every wallet contributes the same amount per round. The contract enforces this on-chain.

---

## `// architecture`

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Vite + JS)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  Home / Cols │  │  Token Detail│  │  Bubble Map  │               │
│  │  + Carousel  │  │  + Trade UI  │  │  + Holders   │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                     │
│  src/main.js                  src/wallet.js          src/ipfs.js    │
│  src/launchpad.js             src/jupiter.js         src/tokens.js  │
│  src/bubble/*                 src/token-detail/*     src/profile.js │
└─────────────┬───────────────────────────────┬───────────────────────┘
              │                               │
              │  read-only                    │  signed tx
              ▼                               ▼
┌───────────────────────────┐    ┌────────────────────────────────────┐
│      HELIUS RPC           │    │       CARPET PROGRAM (Rust)        │
│  - getProgramAccounts     │    │  ┌──────────────────────────────┐  │
│  - getTokenLargestAccts   │    │  │  carpet_presale.rs           │  │
│  - getTokenAccountsByOwner│    │  │  - PresaleMode { Reg, Extr } │  │
└───────────────────────────┘    │  │  - contribute_presale()      │  │
                                 │  │  - finalize_presale()        │  │
              ┌──────────────────│  └──────────────────────────────┘  │
              │                  │  ┌──────────────────────────────┐  │
              │                  │  │  carpet_bonding.rs           │  │
              ▼                  │  │  - buy_bonding()             │  │
┌──────────────────────────┐     │  │  - sell_bonding() (24% tax)  │  │
│   PINATA / IPFS          │     │  │  - migrate_to_meteora()      │  │
│   - token metadata       │     │  │  - execute_buyback()         │  │
│   - images               │     │  │  - claim_lp_fees()           │  │
└──────────────────────────┘     │  └──────────────────────────────┘  │
                                 └────────────┬───────────────────────┘
                                              │
                                              ▼
                                 ┌────────────────────────────────────┐
                                 │   METEORA DAMM v2                  │
                                 │   cpamdpZCGKUy5JxQXB4dcpGPiikH...  │
                                 │   - permanent_lock_position()      │
                                 │   - claim_position_fee()           │
                                 └────────────────────────────────────┘
```

### Phase 2 (planned)

```
┌─────────────────────────────┐
│   CARPET INDEXER (Rust)     │      Geyser stream from Helius
│   - parses program logs     │ ◄────  - buy / sell / contribute
│   - aggregates OHLCV bars   │
│   - writes to TimescaleDB   │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   api.carpet.fun (TS)       │
│   GET  /candles             │
│   GET  /trades              │      Frontend connects via
│   GET  /token               │ ────► token-detail/data/*
│   WS   /stream              │
│   WS   /trades-stream       │
└─────────────────────────────┘
```

---

## `// smart contracts`

Two Anchor programs, deployed as one combined program ID for simpler client interaction:

### `programs/carpet_presale.rs`

| Instruction | Purpose |
| :--- | :--- |
| `init_presale` | Creator configures mode (Regular/Extreme), schedule, target |
| `contribute_presale` | User contributes SOL to the current open round |
| `claim_round` | After round closes, user claims their proportional tokens |
| `finalize_presale` | At end of last round, burn 60% of unsold supply |
| `migrate_to_bonding` | Hand off remaining supply + treasury to the bonding curve |

### `programs/carpet_bonding.rs`

| Instruction | Purpose |
| :--- | :--- |
| `init_bonding` | Creates curve PDA, mint authority, reserve vault |
| `buy_bonding` | User trades SOL for tokens along the curve, 1% fee, 1% max-wallet check |
| `sell_bonding` | User trades tokens for SOL, 1% fee + 24% sell tax to buyback treasury |
| `migrate_to_meteora` | At 100 SOL reserve, atomically moves liquidity to Meteora DAMM v2 |
| `execute_buyback` | Permissionless crank — anyone can call to spend buyback treasury |
| `claim_lp_fees` | Claims accrued Meteora trading fees from the locked LP position |

### Constraints enforced on-chain

- Token mint **must have `freeze_authority = None`** (no freezing user balances)
- `mint_authority` revoked at end of bonding (no infinite mint)
- 1% max-wallet check at every `buy_bonding` call (atomic, can't be sandwich-bypassed)
- 3-hour token lock after each purchase (no instant flip)
- LP NFT from Meteora migration locked to program PDA (no rug)

---

## `// getting started`

### Prerequisites

```bash
node --version    # >= 18.0
rust --version    # >= 1.75
solana --version  # >= 1.18
anchor --version  # >= 0.30
```

### Frontend (development)

```bash
git clone https://github.com/teamcarpet/carpet.git
cd carpet
npm install

# Configure env — copy template and add your keys
cp .env.example .env
# Edit .env:
#   VITE_HELIUS_KEY=your_helius_api_key
#   VITE_PINATA_JWT=your_pinata_jwt
#   VITE_PINATA_GATEWAY=gateway.pinata.cloud

npm run dev
# → http://localhost:5173
```

### Smart contracts (build & deploy to devnet)

```bash
cd programs/

# Build both programs
anchor build

# Deploy to devnet (uses ~/.config/solana/id.json by default)
anchor deploy --provider.cluster devnet

# Run tests
anchor test --provider.cluster devnet
```

### Production build

```bash
npm run build
# Output: dist/
# Deploy dist/ to any static host (Netlify, Vercel, Cloudflare Pages)
```

---

## `// project structure`

```
carpet/
├── index.html                          # Single-page entry, all CSS inlined
├── src/
│   ├── main.js                         # App entry, wires all modules
│   ├── wallet.js                       # Phantom / Solflare connection
│   ├── launchpad.js                    # Anchor client for buy/sell/launch
│   ├── jupiter.js                      # Jupiter API for non-launchpad swaps
│   ├── ipfs.js                         # Pinata upload for token metadata
│   ├── tokens.js                       # Token creation flow
│   ├── platform.js                     # Local store of launched tokens
│   ├── profile.js                      # User profile view
│   ├── config.js                       # Network constants
│   │
│   ├── bubble/                         # Bubble map module (holder graph)
│   │   ├── bubble.js                   # Entry: mountBubbleView()
│   │   ├── bubble.css
│   │   ├── search-view.js              # Trending + Featured columns
│   │   ├── graph-view.js               # Force-directed canvas
│   │   ├── data/
│   │   │   ├── fetcher.js              # Helius RPC, IndexedDB cache
│   │   │   ├── transformer.js          # Holders → graph nodes/edges
│   │   │   └── labels.js               # Known wallet labels
│   │   ├── render/
│   │   │   ├── canvas.js               # 60fps canvas renderer
│   │   │   ├── forces.js               # d3-force simulation
│   │   │   └── zoom.js                 # d3-zoom + pan
│   │   └── ui/
│   │       ├── address-list.js
│   │       └── info-panel.js
│   │
│   └── token-detail/                   # Token detail page (pump.fun-style)
│       ├── token-detail.js             # Entry: mountTokenDetail()
│       ├── token-detail.css
│       ├── components/
│       │   ├── header.js               # Avatar / ticker / share / copy
│       │   ├── market-card.js          # MC / ATH / 24h
│       │   ├── chart-toolbar.js        # Timeframe + price/mcap toggle
│       │   ├── chart-embed.js          # TradingView wrapper
│       │   ├── trades-table.js         # Live trades (WS-ready)
│       │   ├── trade-panel.js          # Buy/Sell side panel
│       │   ├── bonding-progress.js     # % to migration
│       │   ├── top-holders.js          # Reuses bubble fetcher
│       │   ├── chat-panel.js
│       │   └── mobile-cta.js           # Fixed bottom sheet for mobile
│       └── data/
│           ├── candles-fetcher.js      # OHLCV REST + WS
│           ├── trades-fetcher.js       # Trades REST + WS
│           ├── tv-datafeed.js          # TradingView Datafeed adapter
│           └── token-info-fetcher.js
│
├── mobile-css/                         # Mobile responsive overlays
│   ├── mobile-main.css                 # Layout, header, sidebar→tabbar
│   ├── mobile-bubble.css               # Bubble map mobile
│   └── mobile-token-detail.css         # Token detail mobile + bottom sheet
│
├── programs/                           # Anchor smart contracts
│   ├── carpet_presale/
│   │   └── src/lib.rs
│   └── carpet_bonding/
│       └── src/lib.rs
│
├── tests/                              # Anchor tests (TS)
├── Anchor.toml
├── package.json
└── vite.config.js
```

---

## `// roadmap`

```
phase 1 — pre-mainnet                                          [current]
├── frontend complete                                          [done]
├── mobile responsive                                          [done]
├── smart contracts written                                    [done]
├── devnet testing                                             [done]
├── security audit                                             [pending]
└── mainnet deployment                                         [pending]

phase 2 — post-mainnet
├── backend indexer (api.carpet.fun)
├── TradingView charts integration
├── Twitter verify-to-buy gate
├── off-chain buyback crank bot
├── real-time trades stream
└── creator rewards module

phase 3 — ecosystem
├── public API for third-party integrations
├── creator analytics dashboard
├── governance over platform fees
└── cross-chain expansion (Sonic SVM, Eclipse)
```

---

## `// FAQ`

**Q: How is this different from pump.fun?**
A: pump.fun is built for memecoin churn — most tokens die within hours. CARPET adds presale modes for fair distribution, on-chain anti-bot enforcement, and a buyback loop that captures sell pressure instead of letting it kill the token. The bonding curve is similar; everything around it is different.

**Q: Why Meteora DAMM v2 and not Raydium?**
A: DAMM v2 has concentrated liquidity, permanent LP locking, and on-chain fee accrual that can be claimed by the program. Raydium CPMM has none of that. With Meteora we can keep capturing value after migration.

**Q: What happens if no one calls `execute_buyback`?**
A: Treasury accumulates. Anyone can call it permissionlessly — there's no privileged role. We'll run an off-chain crank as a fallback, but the contract doesn't depend on it.

**Q: Can the team rug the LP?**
A: No. The LP NFT from Meteora migration is locked to a program PDA at the moment of migration. The program has no instruction to transfer it out. The only thing that can be claimed are the trading fees.

**Q: What's the platform fee?**
A: 1% of every trade (buy and sell), plus 1% of the migration reserve. No mint tax. No deploy fee beyond Solana rent. The rest of the migration reserve is split between Meteora LP, creator (presale only), and buyback treasury — see the [tokenomics section](#-tokenomics) for exact percentages per launch type.

---

## `// license`

MIT — see [LICENSE](LICENSE).

---

<div align="center">

```
> CARPET TERMINAL
> built on Solana · 2026
> every token deserves a red carpet moment
```

</div>
