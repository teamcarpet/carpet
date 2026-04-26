// ─────────────────────────────────────────────────────────────────────────
// Mock event emitter — Phase 2 development tool.
//
// Generates plausible-looking trades for a fixed set of mock mints every
// N seconds, runs them through the same pipeline as real events. Used to:
//   - test the indexer → DB → API → WS pipeline without real chain data
//   - drive the frontend during demos when the contract has no activity
//   - reproduce edge cases (price spikes, sell pressure) deterministically
//
// Disable with MOCK_MODE=false in production / live testing.
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import { logger } from '@carpet/shared';
import type { Trade } from '@carpet/shared/types';
import { handleTrade } from './handlers/tokens-bought.js';

interface MockMint {
  mint:    string;
  ticker:  string;
  name:    string;
  pool:    string;
  creator: string;
  /** Walking price in SOL — random walk with mean reversion */
  price:   number;
}

// Three mock tokens roughly mirroring the diversity we'll see in production.
// Mints are random-ish base58 strings (won't collide with real mints).
const MOCK_TOKENS: MockMint[] = [
  { mint: 'CarpetTestMint1111111111111111111111111111', ticker: 'TEST', name: 'Test Token',     pool: 'CarpetTestPool11111111111111111111111111', creator: 'CarpetCreator11111111111111111111111111111', price: 0.0000045 },
  { mint: 'CarpetTestMint2222222222222222222222222222', ticker: 'DEMO', name: 'Demo Coin',      pool: 'CarpetTestPool22222222222222222222222222', creator: 'CarpetCreator22222222222222222222222222222', price: 0.0000128 },
  { mint: 'CarpetTestMint3333333333333333333333333333', ticker: 'MOCK', name: 'Mock Carpet',    pool: 'CarpetTestPool33333333333333333333333333', creator: 'CarpetCreator33333333333333333333333333333', price: 0.0000721 },
];

// Random mock wallet generator — picks from a pool of fake addresses.
const MOCK_WALLETS = Array.from({ length: 20 }, (_, i) =>
  `MockWallet${String(i).padStart(2, '0')}${'x'.repeat(34)}`.slice(0, 44),
);

function pick<T>(arr: readonly T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error('pick: empty array');
  return item;
}

/**
 * Random walk with mean reversion. Keeps prices in a believable range.
 * Pulls back toward the starting price with strength proportional to deviation.
 */
function step(current: number, base: number): number {
  const drift   = (Math.random() - 0.5) * 0.04;          // ±4% per step
  const reversion = (base - current) / current * 0.15;   // pull toward base
  return Math.max(1e-9, current * (1 + drift + reversion));
}

export function startMockEmitter({ redis, intervalMs }: { redis: Redis; intervalMs: number }): void {
  logger.info({ tokens: MOCK_TOKENS.length, intervalMs }, 'Mock emitter started');

  // Snapshot starting prices so mean reversion has a reference point
  const baselines = new Map(MOCK_TOKENS.map(t => [t.mint, t.price]));

  setInterval(async () => {
    const token   = pick(MOCK_TOKENS);
    const baseline = baselines.get(token.mint)!;
    token.price = step(token.price, baseline);

    const isBuy   = Math.random() > 0.45;            // slight buy bias
    const amountSol   = +(Math.random() * 0.5 + 0.01).toFixed(6);
    const amountToken = +(amountSol / token.price).toFixed(2);

    // Mock signature — 88 chars base58-ish
    const signature = Array.from({ length: 88 }, () =>
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789'[Math.floor(Math.random() * 58)],
    ).join('');

    const trade: Trade = {
      signature,
      pool:        token.pool,
      mint:        token.mint,
      account:     pick(MOCK_WALLETS),
      side:        isBuy ? 'buy' : 'sell',
      amountSol,
      amountToken,
      priceUsd:    null,
      priceSol:    token.price,
      feePlatform: amountSol * 0.01,
      feeCreator:  0,
      sellTax:     isBuy ? 0 : amountSol * 0.24,
      timestamp:   Math.floor(Date.now() / 1000),
      slot:        Math.floor(Date.now() / 400),         // fake slot ~ 1 per 400ms
    };

    try {
      await handleTrade(trade, redis);
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Mock trade handler failed');
    }
  }, intervalMs);
}
