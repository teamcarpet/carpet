// src/token-detail/data/token-info-fetcher.js
// Token metadata and market data aggregator.
//
// Combines three sources:
//   1. Local platform store (getToken from platform.js) — ticker, name, image, creator
//   2. Carpet indexer backend (/token?mint=X) — market cap, ATH, holders, volume, bonding progress
//   3. (Fallback) if backend unavailable — use whatever local store has
//
// Result shape:
//   {
//     mint, tk, n, em, imageUrl, creator, createdAt,
//     mc, ath, pct, mcChange24h, volume24h, holders,
//     prog, isMigrated, curve,
//     // market metadata returned by the indexer:
//     // price_usd, price_sol, supply, decimals, ...
//   }

import { getToken } from '../../platform.js';

const API_ROOT = 'http://localhost:3000';

export async function fetchTokenInfo(mint) {
  // Start from local store — always available.
  const local = getToken?.(null);   // defensive: only exists if platform.js is loaded
  const fromStore = typeof getToken === 'function'
    ? (allTokens() || []).find(t => t.mint === mint) || {}
    : {};

  const base = {
    mint,
    tk:        fromStore.tk,
    n:         fromStore.n,
    em:        fromStore.em,
    imageUrl:  fromStore.imageUrl,
    creator:   fromStore.creator,
    createdAt: fromStore.createdAt,
    mc:        fromStore.mc,
    pct:       fromStore.pct,
    prog:      fromStore.prog,
    isMigrated: fromStore.col === 'migrated',
  };

  // Merge with indexer data if available.
  try {
    const res = await fetch(`${API_ROOT}/token?mint=${mint}`);
    if (res.ok) {
      const data = await res.json();
      return { ...base, ...data };
    }
  } catch { /* backend offline — local only */ }

  return base;
}

// Helper — platform.js exposes getTokens via module import.
// We keep it inline to avoid a circular import.
function allTokens() {
  try {
    const raw = localStorage.getItem('carpet_tokens') || '[]';
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
