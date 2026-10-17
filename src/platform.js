// localStorage-based platform data store.
// Replace with a real API/DB backend for production multi-user deployment.

import { isBase58Address, safeUrl } from './escape.js';
import { CONFIG } from './config.js';

// Cached tokens belong to one launchpad program. Keys carry its address so a
// redeploy to a new program never shows pools that don't exist on it.
const NS = CONFIG.LAUNCHPAD.programId;
const TOKENS_KEY  = `carpet_tokens:${NS}`;
const LIVES_KEY   = `carpet_lives:${NS}`;
const REWARDS_KEY = `carpet_rewards:${NS}`;

try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (/^carpet_(tokens|lives|rewards)(:|$)/.test(k) && !k.endsWith(`:${NS}`)) localStorage.removeItem(k);
  }
} catch {}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function write(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

// ── Tokens ──────────────────────────────────────────────────────────────────

// Every token passes through here before rendering, so ids/addresses that end up
// inside onclick="..." attributes are guaranteed to be plain base58 or digits.
const TEXT_LIMITS = { n: 32, tk: 10, desc: 500, d2: 500, twitter: 200, telegram: 200, em: 8 };
const NUMERIC = ['mc', 'vol', 'h', 'pct', 'prog', 'ath', 'priceSol', 'decimals', 'createdAt'];

function sanitizeToken(t) {
  if (!t || typeof t !== 'object') return null;
  const out = { ...t };
  out.id = String(t.id ?? '');
  if (!/^[\w]{1,64}$/.test(out.id)) return null;
  for (const [k, max] of Object.entries(TEXT_LIMITS)) {
    if (out[k] != null) out[k] = String(out[k]).slice(0, max);
  }
  for (const k of NUMERIC) if (out[k] != null) out[k] = Number(out[k]) || 0;
  for (const k of ['mint', 'creator', 'poolAddress', 'meteoraPool']) {
    if (out[k] != null && !isBase58Address(out[k])) delete out[k];
  }
  for (const k of ['imageUrl', 'metaUrl', 'website']) {
    if (out[k] != null) out[k] = safeUrl(out[k]);
  }
  out.mode = out.mode === 'presale' ? 'presale' : 'bonding';
  out.col = ['new', 'bonding', 'migrated'].includes(out.col) ? out.col : 'new';
  return out;
}

export function getTokens() { return read(TOKENS_KEY).map(sanitizeToken).filter(Boolean); }

export function getToken(id) { return getTokens().find(t => String(t.id) === String(id)) || null; }

export function addToken(token) {
  const tokens = getTokens();
  const entry = {
    ...token,
    id: String(token.id || Date.now()),
    createdAt: Date.now(),
    col: 'new',
    prog: 0,
    mc: 0,
    vol: 0,
    h: 0,
    pct: 0,
  };
  tokens.unshift(entry);
  write(TOKENS_KEY, tokens);
  window.dispatchEvent(new CustomEvent('platform:token-added', { detail: entry }));
  return entry;
}

export function updateToken(id, updates) {
  const tokens = getTokens();
  const idx = tokens.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tokens[idx] = { ...tokens[idx], ...updates };
  write(TOKENS_KEY, tokens);
  window.dispatchEvent(new CustomEvent('platform:token-updated', { detail: tokens[idx] }));
  return tokens[idx];
}

export function mergeIndexedTokens(indexedTokens = []) {
  if (!Array.isArray(indexedTokens) || !indexedTokens.length) return [];
  const tokens = getTokens();
  let changed = false;
  const byMint = new Map(tokens.filter(t => t.mint).map(t => [t.mint, t]));

  for (const indexed of indexedTokens) {
    if (!indexed?.mint) continue;
    const existing = byMint.get(indexed.mint);
    const merged = normalizeIndexedToken(existing, indexed);
    if (existing) {
      const idx = tokens.findIndex(t => t.mint === indexed.mint);
      tokens[idx] = { ...existing, ...merged };
    } else {
      tokens.push({
        id: indexed.mint,
        createdAt: Number(indexed.createdAt || Date.now() / 1000) * 1000,
        ...merged,
      });
    }
    changed = true;
  }

  if (changed) {
    write(TOKENS_KEY, tokens);
    window.dispatchEvent(new CustomEvent('platform:tokens-synced', { detail: tokens }));
  }
  return tokens;
}

function normalizeIndexedToken(existing = {}, indexed = {}) {
  const prog = Number(indexed.prog ?? indexed.progressPct ?? existing.prog ?? 0);
  const isMigrated = Boolean(indexed.isMigrated ?? existing.isMigrated);
  return {
    mint: indexed.mint,
    tk: indexed.ticker ?? existing.tk,
    n: indexed.name ?? existing.n,
    imageUrl: indexed.imageUrl ?? existing.imageUrl,
    creator: indexed.creator ?? existing.creator,
    mode: (indexed.poolType ?? existing.mode) === 'presale' ? 'presale' : 'bonding',
    poolAddress: indexed.poolAddress ?? existing.poolAddress,
    meteoraPool: indexed.meteoraPool ?? existing.meteoraPool,
    isMigrated,
    col: isMigrated ? 'migrated' : prog >= 50 ? 'bonding' : 'new',
    mc: Number(indexed.marketCap ?? existing.mc ?? 0),
    vol: Number(indexed.volume24h ?? existing.vol ?? 0),
    h: Number(indexed.holders ?? existing.h ?? 0),
    pct: Number(indexed.pctChange24h ?? existing.pct ?? 0),
    ath: Number(indexed.ath ?? existing.ath ?? 0),
    prog,
    priceSol: Number(indexed.priceSol ?? existing.priceSol ?? 0),
    // Indexer sends epoch seconds; replaces placeholders from share links.
    createdAt: indexed.createdAt ? Number(indexed.createdAt) * 1000 : existing.createdAt,
  };
}

export function deleteToken(id) {
  const tokens = getTokens().filter(t => t.id !== id);
  write(TOKENS_KEY, tokens);
}

export function getTickerTokens() {
  return getTokens().slice(0, 40).map(t => ({
    name: t.n,
    ticker: t.tk,
    pct: t.pct,
  }));
}

// ── Live streams ─────────────────────────────────────────────────────────────

export function getLives() { return read(LIVES_KEY); }

export function addLive(live) {
  const lives = getLives();
  const entry = {
    ...live,
    id: live.id || Date.now(),
    startedAt: Date.now(),
    viewers: 0,
    active: true,
  };
  lives.unshift(entry);
  write(LIVES_KEY, lives);
  window.dispatchEvent(new CustomEvent('platform:live-added', { detail: entry }));
  return entry;
}

export function updateLive(id, updates) {
  const lives = getLives();
  const idx = lives.findIndex(l => l.id === id);
  if (idx === -1) return null;
  lives[idx] = { ...lives[idx], ...updates };
  write(LIVES_KEY, lives);
  return lives[idx];
}

export function endLive(id) { return updateLive(id, { active: false, endedAt: Date.now() }); }

export function getActiveLives() { return getLives().filter(l => l.active); }

// ── Rewards ──────────────────────────────────────────────────────────────────

export function getRewards() { return read(REWARDS_KEY); }

export function addReward(reward) {
  const rewards = getRewards();
  rewards.unshift({ ...reward, id: reward.id || Date.now(), time: new Date().toISOString() });
  write(REWARDS_KEY, rewards.slice(0, 200));
}
