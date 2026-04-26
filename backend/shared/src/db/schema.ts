import {
  pgTable,
  bigint,
  text,
  doublePrecision,
  integer,
  smallint,
  timestamp,
  boolean,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────────────────────────────────
// tokens — one row per CARPET-launched token
// ─────────────────────────────────────────────────────────────────────────
export const tokens = pgTable('tokens', {
  mint:        text('mint').primaryKey(),
  ticker:      text('ticker').notNull(),
  name:        text('name').notNull(),
  imageUrl:    text('image_url'),
  creator:     text('creator').notNull(),
  poolType:    text('pool_type').notNull(),         // 'bonding' | 'presale'
  poolAddress: text('pool_address').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  isMigrated:  boolean('is_migrated').notNull().default(false),
  meteoraPool: text('meteora_pool'),
  ath:         doublePrecision('ath').notNull().default(0),
}, (t) => ({
  poolIdx:    index('tokens_pool_idx').on(t.poolAddress),
  creatorIdx: index('tokens_creator_idx').on(t.creator),
}));

// ─────────────────────────────────────────────────────────────────────────
// trades — append-only log of every buy/sell
// Will be converted to a TimescaleDB hypertable in 0001_initial.sql
// (Drizzle has no native hypertable support yet, so we add it post-migration.)
// ─────────────────────────────────────────────────────────────────────────
export const trades = pgTable('trades', {
  // Composite key: (signature, mint) — same tx can touch multiple mints in theory
  signature:   text('signature').notNull(),
  mint:        text('mint').notNull(),
  pool:        text('pool').notNull(),
  account:     text('account').notNull(),
  side:        text('side').notNull(),                 // 'buy' | 'sell'
  amountSol:   doublePrecision('amount_sol').notNull(),
  amountToken: doublePrecision('amount_token').notNull(),
  priceUsd:    doublePrecision('price_usd'),
  priceSol:    doublePrecision('price_sol').notNull(),
  feePlatform: doublePrecision('fee_platform').notNull().default(0),
  feeCreator:  doublePrecision('fee_creator').notNull().default(0),
  sellTax:     doublePrecision('sell_tax').notNull().default(0),
  timestamp:   timestamp('timestamp', { withTimezone: true }).notNull(),
  slot:        bigint('slot', { mode: 'number' }).notNull(),
}, (t) => ({
  pk:          primaryKey({ columns: [t.signature, t.mint] }),
  mintTimeIdx: index('trades_mint_time_idx').on(t.mint, t.timestamp),
  accountIdx:  index('trades_account_idx').on(t.account),
}));

// ─────────────────────────────────────────────────────────────────────────
// candles — OHLCV per (mint, resolution) bucket
// Populated by TimescaleDB continuous aggregates (defined in SQL migration).
// This Drizzle definition is here only so we can SELECT typed rows.
// ─────────────────────────────────────────────────────────────────────────
export const candles = pgTable('candles', {
  mint:       text('mint').notNull(),
  resolution: text('resolution').notNull(),            // '1' | '5' | '15' | '60' | '240' | 'D'
  time:       timestamp('time', { withTimezone: true }).notNull(),
  open:       doublePrecision('open').notNull(),
  high:       doublePrecision('high').notNull(),
  low:        doublePrecision('low').notNull(),
  close:      doublePrecision('close').notNull(),
  volume:     doublePrecision('volume').notNull(),
  trades:     integer('trades').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.mint, t.resolution, t.time] }),
}));

// ─────────────────────────────────────────────────────────────────────────
// pool_state — latest snapshot of each pool (overwritten on each event)
// ─────────────────────────────────────────────────────────────────────────
export const poolState = pgTable('pool_state', {
  pool:           text('pool').primaryKey(),
  mint:           text('mint').notNull(),
  totalRaisedSol: doublePrecision('total_raised_sol').notNull().default(0),
  migrationTarget: doublePrecision('migration_target').notNull().default(100),
  progressPct:    doublePrecision('progress_pct').notNull().default(0),
  reserveSol:     doublePrecision('reserve_sol').notNull().default(0),
  reserveToken:   doublePrecision('reserve_token').notNull().default(0),
  priceSol:       doublePrecision('price_sol').notNull().default(0),
  priceUsd:       doublePrecision('price_usd'),
  marketCap:      doublePrecision('market_cap').notNull().default(0),
  isMigrated:     boolean('is_migrated').notNull().default(false),
  lastUpdated:    timestamp('last_updated', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  mintIdx: index('pool_state_mint_idx').on(t.mint),
}));

// ─────────────────────────────────────────────────────────────────────────
// presale_state — schedule + raised amount per presale pool
// ─────────────────────────────────────────────────────────────────────────
export const presaleState = pgTable('presale_state', {
  pool:           text('pool').primaryKey(),
  mint:           text('mint').notNull(),
  mode:           smallint('mode').notNull(),         // 0=Regular, 1=Extreme
  totalRounds:    smallint('total_rounds').notNull(),
  currentRound:   smallint('current_round').notNull().default(0),
  startTime:      timestamp('start_time', { withTimezone: true }).notNull(),
  endTime:        timestamp('end_time', { withTimezone: true }).notNull(),
  totalRaisedSol: doublePrecision('total_raised_sol').notNull().default(0),
  contributors:   integer('contributors').notNull().default(0),
});

// ─────────────────────────────────────────────────────────────────────────
// indexer_cursor — single row tracking the last processed slot
// Lets us resume cleanly after restart without missing events.
// ─────────────────────────────────────────────────────────────────────────
export const indexerCursor = pgTable('indexer_cursor', {
  id:        text('id').primaryKey(),                 // always 'main'
  lastSlot:  bigint('last_slot', { mode: 'number' }).notNull().default(0),
  lastSig:   text('last_sig'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
