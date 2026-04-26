// ─────────────────────────────────────────────────────────────────────────
// Handles BuybackExecuted events — when the contract spends treasury SOL
// to buy and burn tokens.
//
// Logged for analytics. No table change — buybacks just appear as trades
// (with `account` set to the contract's PDA) which already records them.
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import { logger } from '@carpet/shared';

export interface BuybackEvent {
  pool:           string;
  mint:           string;
  amountSolSpent: number;
  amountTokenBurned: number;
  timestamp:      number;
  slot:           number;
}

export async function handleBuyback(evt: BuybackEvent, _redis: Redis): Promise<void> {
  logger.info(
    { mint: evt.mint.slice(0, 8), sol: evt.amountSolSpent, burned: evt.amountTokenBurned },
    'buyback executed',
  );
}
