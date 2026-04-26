// Domain types shared across indexer / api / ws.
// Mirrors the on-chain event structures from contracts/programs/launchpad/src/events.rs

export type PoolType = 'bonding' | 'presale';
export type TradeSide = 'buy' | 'sell';
export type Resolution = '1' | '5' | '15' | '60' | '240' | 'D';

/** A single trade event produced by tokens_bought / tokens_sold on-chain. */
export interface Trade {
  signature:   string;
  pool:        string;            // pool PDA address
  mint:        string;
  account:     string;            // buyer or seller wallet
  side:        TradeSide;
  amountSol:   number;            // SOL (not lamports)
  amountToken: number;            // human units (not raw)
  priceUsd:    number | null;
  priceSol:    number;            // SOL per token at execution
  feePlatform: number;            // SOL
  feeCreator:  number;            // SOL (0 for platform-only fees)
  sellTax:     number;            // SOL — only for sells
  timestamp:   number;            // unix seconds
  slot:        number;
}

/** OHLCV bar for the chart. Aggregated from trades by TimescaleDB. */
export interface Candle {
  mint:       string;
  resolution: Resolution;
  time:       number;             // unix seconds, bucket start
  open:       number;
  high:       number;
  low:        number;
  close:      number;
  volume:     number;             // token units
  trades:     number;             // count of trades in this bucket
}

/** Token metadata as returned from /token endpoint. */
export interface TokenInfo {
  mint:        string;
  ticker:      string;
  name:        string;
  imageUrl:    string | null;
  creator:     string;
  poolType:    PoolType;
  poolAddress: string;
  createdAt:   number;            // unix seconds

  // Live market data (from latest aggregation)
  priceUsd:    number | null;
  priceSol:    number;
  marketCap:   number;
  ath:         number;
  pctChange24h: number;
  mcChange24h:  number;
  volume24h:    number;
  holders:      number;

  // Bonding-specific
  prog:         number;            // % to migration target (0..100)
  isMigrated:   boolean;
  meteoraPool:  string | null;
}

// ── Wire format for WebSocket broadcasts ────────────────────────────────

export type WsOutbound =
  | { type: 'trade';   data: Trade }
  | { type: 'candle';  data: Candle }
  | { type: 'pong';    data: { ts: number } }
  | { type: 'subscribed';   data: { channel: string } }
  | { type: 'unsubscribed'; data: { channel: string } }
  | { type: 'error';   data: { message: string } };

export type WsInbound =
  | { type: 'subscribe';   channel: 'trades' | 'candles'; mint: string; resolution?: Resolution }
  | { type: 'unsubscribe'; channel: 'trades' | 'candles'; mint: string; resolution?: Resolution }
  | { type: 'ping' };
