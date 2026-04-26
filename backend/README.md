# CARPET Backend

```
        ┌──────────────────┐
        │    FRONTEND      │
        │  (Vite + Netlify)│
        └────┬─────────┬───┘
             │ HTTPS   │ WSS
             ▼         ▼
        ┌────────┐  ┌────────┐
        │  api   │  │   ws   │
        └────────┘  └────────┘
             │         ▲
             ▼         │
        ┌──────────┐   │   pub/sub
        │ Postgres │   │
        │ +TimescaleDB │
        └──────────┘   │
             ▲         │
             │ writes  │
        ┌────┴─────────┴────┐
        │     indexer       │ ──── gRPC ──── Yellowstone (Constant Kaldera)
        └───────────────────┘
```

Three independent Node.js services (`indexer`, `api`, `ws`) sharing a Postgres+TimescaleDB instance and a Redis instance for pub/sub. Deployed on Railway as separate services from the same git monorepo.

## Architecture

| Service  | Role | Inbound | Outbound |
| :--- | :--- | :--- | :--- |
| `indexer` | Watches the CARPET program on-chain, decodes events, writes to DB, publishes to Redis | gRPC from Yellowstone | Postgres writes, Redis publish |
| `api`     | REST endpoints for the frontend | HTTPS from browsers | Postgres reads |
| `ws`      | WebSocket fan-out of real-time events | WSS from browsers, Redis sub | WSS pushes to clients |

## Local development

### Prerequisites

```
node    >= 20
docker  >= 24    (for Postgres+Timescale and Redis)
```

### One-time setup

```bash
cd backend
cp .env.example .env

# Start Postgres and Redis containers
npm run infra:up

# Install all workspace deps
npm install

# Apply migrations (creates tables + Timescale hypertables)
npm run db:migrate
```

### Run

In three terminals:

```bash
# Terminal 1 — indexer (mock mode)
npm run dev:indexer

# Terminal 2 — REST API
npm run dev:api

# Terminal 3 — WebSocket service
npm run dev:ws
```

You should see:

- Indexer logs `Mock emitter started` and emits a fake trade every 5 seconds.
- API responds on `http://localhost:3000/health` with `{ok: true}`.
- WS responds on `http://localhost:3001/health` with `{ok: true, connections: 0}`.

### Verify the pipeline

```bash
# Wait ~30s for mock trades to accumulate, then:
curl 'http://localhost:3000/trades?mint=CarpetTestMint1111111111111111111111111111&limit=10'
# Should return ~5 fake trades

curl 'http://localhost:3000/candles?mint=CarpetTestMint1111111111111111111111111111&resolution=1'
# Should return at least one OHLCV bar after a minute
```

WebSocket subscription test:

```bash
# Install wscat once: npm i -g wscat
wscat -c ws://localhost:3001/

> {"type":"subscribe","channel":"trades","mint":"CarpetTestMint1111111111111111111111111111"}
< {"type":"subscribed","data":{"channel":"trades:CarpetTes"}}
< {"type":"trade","data":{"signature":"...", "side":"buy", ...}}
```

## Switching to live data

Set in `.env`:

```bash
MOCK_MODE=false
SOLANA_CLUSTER=devnet                 # or mainnet
GEYSER_ENDPOINT=https://kaldera-frankfurt.constant-k.com/
GEYSER_X_TOKEN=<your-rotated-token>
PROGRAM_ID=DywpVp5YfLiX4M3xfEp333Y2dmq8xywdNAYaWDw6v9XV
```

Restart the indexer. It should log:

```
Connecting to Yellowstone gRPC ...
Yellowstone subscription active
```

For event decoding (Phase 3): copy `contracts/target/idl/launchpad.json` into `backend/indexer/idl/launchpad.json` (path can be customised via `IDL_PATH` env var). Without the IDL the indexer will subscribe and log slot numbers, but won't write to the database.

## Deployment to Railway

### One-time per project

1. Create a new Railway project: `railway.app/new`
2. Add the **Postgres** plugin → it provisions Postgres, exposes `DATABASE_URL`.
3. Enable TimescaleDB extension on the Postgres instance:
   ```sql
   CREATE EXTENSION timescaledb CASCADE;
   ```
4. Add the **Redis** plugin → it provisions Redis, exposes `REDIS_URL`.

### Per-service

For **each** of `indexer`, `api`, `ws`:

1. Click **+ New** → **GitHub Repo** → select `teamcarpet/carpet`
2. **Root Directory**: `backend`
3. **Watch Paths**: `backend/<service>/**` and `backend/shared/**`
4. **Build**: Dockerfile (Railway auto-detects via `railway.toml`)
5. **Variables**: copy from `.env.example`, paste real values
   - `DATABASE_URL` → use Railway reference: `${{Postgres.DATABASE_URL}}`
   - `REDIS_URL` → use Railway reference: `${{Redis.REDIS_URL}}`
   - `GEYSER_X_TOKEN` → real token from Constant dashboard
   - `MOCK_MODE` → `true` for first deploy, `false` once you confirm pipeline works

### After first deploy

```bash
# From local machine, point DATABASE_URL to Railway's Postgres and run:
DATABASE_URL='postgres://...railway...' npm run db:migrate
```

(Railway doesn't run migrations automatically — we trigger from local.)

### Custom domains

In Railway each service can have a custom subdomain:

- `api.carpet.fun`  → api service
- `ws.carpet.fun`   → ws service

The indexer doesn't need a public domain — it only makes outbound connections.

## Environment variables

See `.env.example`. The validators in `shared/src/env.ts` will refuse to start any service with missing or malformed values.

| Variable | Required by | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | all | Postgres connection |
| `REDIS_URL` | all | Redis connection |
| `SOLANA_CLUSTER` | indexer | `devnet` or `mainnet` |
| `SOLANA_RPC_URL` | indexer, api | Standard JSON-RPC for direct chain reads |
| `PROGRAM_ID` | indexer | CARPET program ID |
| `GEYSER_ENDPOINT` | indexer | Yellowstone gRPC URL |
| `GEYSER_X_TOKEN` | indexer | Yellowstone auth token |
| `MOCK_MODE` | indexer | `true` to emit fake trades |
| `API_PORT` | api | Defaults to 3000 |
| `WS_PORT` | ws | Defaults to 3001 |
| `RATE_LIMIT_MAX` | api | Requests per window per IP |
| `RATE_LIMIT_WINDOW_MS` | api | Window duration in ms |

## API contract

### `GET /token?mint=<base58>`

Returns one token's full info, joining `tokens`, `pool_state`, and 24h aggregates.

### `GET /tokens?col=&sort=&limit=&search=`

Lists tokens. Filters: `col` (`new`, `bonding`, `migrated`, `all`). Sort: `date`, `volume`, `mc`, `progress`, `pct`. Search by ticker or name.

### `GET /candles?mint=&resolution=&from=&to=&countBack=`

OHLCV bars from TimescaleDB continuous aggregates. Resolution: `1`, `5`, `15`, `60`, `240`, `D` (matches TradingView convention).

### `GET /trades?mint=&limit=&minSol=&before=`

Recent trades, newest first. Pagination via `before` (unix seconds).

### `WS /` (the ws service)

Subscribe with:
```json
{ "type": "subscribe", "channel": "trades", "mint": "<base58>" }
{ "type": "subscribe", "channel": "candles", "mint": "<base58>", "resolution": "1" }
```

Server pushes:
```json
{ "type": "trade",  "data": { ... } }
{ "type": "candle", "data": { ... } }
```

## Project layout

```
backend/
├── package.json              # workspace root
├── tsconfig.base.json
├── docker-compose.yml        # local Postgres + Redis
├── .env.example
├── shared/                   # library shared by all services
│   ├── src/
│   │   ├── db/schema.ts      # Drizzle schema
│   │   ├── db/client.ts
│   │   ├── env.ts            # zod env validation
│   │   ├── logger.ts         # pino instance
│   │   ├── redis.ts          # pub/sub helpers
│   │   └── types.ts          # domain types
│   └── migrations/
│       └── 0001_timescale_hypertables.sql
├── indexer/                  # service: gRPC consumer + DB writer
├── api/                      # service: REST API
└── ws/                       # service: WebSocket fan-out
```

## Cost estimate (Railway)

| Item | Hobby | Pro |
| :--- | :---: | :---: |
| 3 services × $5 | $15 | $15 |
| Postgres (1GB) | $5 | $20 |
| Redis (1GB) | $5 | $10 |
| **Total** | **~$25/mo** | **~$45/mo** |

## Operational notes

- **Indexer is a singleton** — running two instances will double-write trades. Idempotent inserts (`ON CONFLICT DO NOTHING`) make this safe but wasteful.
- **WS scales horizontally** — multiple instances behind a load balancer all subscribe to the same Redis channels and broadcast to their own connected clients.
- **Continuous aggregates lag** by their `start_offset` (5 min for 1m candles). Last bar is always slightly stale; this is by design.
- **Compression policy** on `trades` saves ~95% disk after 7 days. Older data is still queryable, just slower.
- **Backups**: Railway snapshots Postgres daily. Keep an off-Railway logical backup if the data matters.

## License

MIT
