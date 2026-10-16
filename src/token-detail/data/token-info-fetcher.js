// src/token-detail/data/token-info-fetcher.js
// Token metadata and market data aggregator.
//
// Combines three sources:
//   1. Local platform store (allTokens from localStorage) — ticker, name, image, creator
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

import { CONFIG } from '../../config.js';

const API_ROOT = CONFIG.apiUrl;

export async function fetchTokenInfo(mint) {
  // Start from local store — always available.
  const fromStore = (allTokens() || []).find(t => t.mint === mint) || {};

  const base = {
    mint,
    tk:        fromStore.tk,
    n:         fromStore.n,
    em:        fromStore.em,
    imageUrl:  fromStore.imageUrl,
    creator:   fromStore.creator,
    mode:      fromStore.mode,
    col:       fromStore.col,
    createdAt: fromStore.createdAt,
    mc:        fromStore.mc,
    pct:       fromStore.pct,
    prog:      fromStore.prog,
    isMigrated: fromStore.col === 'migrated',
  };

  // Merge with indexer data if available.
  try {
    const res = await fetch(`${CONFIG.apiServerUrl}/token?mint=${mint}`);
    if (res.ok) {
      const data = await res.json();
      return normalizeTokenInfo(base, data);
    }
  } catch { /* backend offline — local only */ }

  return base;
}

function normalizeTokenInfo(base, data) {
  const prog = Number(data.prog ?? data.progressPct ?? base.prog ?? 0);
  const isMigrated = Boolean(data.isMigrated ?? base.isMigrated);
  return {
    ...base,
    ...data,
    tk: data.ticker ?? base.tk,
    n: data.name ?? base.n,
    mc: Number(data.marketCap ?? base.mc ?? 0),
    ath: Number(data.ath ?? base.ath ?? 0),
    pct: Number(data.pctChange24h ?? base.pct ?? 0),
    vol: Number(data.volume24h ?? base.vol ?? 0),
    h: Number(data.holders ?? base.h ?? 0),
    prog,
    // API sends epoch seconds; the UI works in milliseconds.
    createdAt: data.createdAt ? (data.createdAt < 1e12 ? data.createdAt * 1000 : data.createdAt) : base.createdAt,
    mode: data.poolType ?? base.mode,
    isMigrated,
    col: isMigrated ? 'migrated' : prog >= 50 ? 'bonding' : (base.col || 'new'),
  };
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
