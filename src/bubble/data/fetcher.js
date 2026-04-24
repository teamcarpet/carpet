// src/bubble/data/fetcher.js
// Helius RPC + DAS data layer for the bubble map.
// Strategy:
//   1. Top-20 holders via getTokenLargestAccounts (1 RPC call)
//   2. Each holder's owner wallet via getAccountInfo batch (parsed)
//   3. Latest transfers for the mint via getSignaturesForAddress
//      + getParsedTransactions batch (2-3 RPC calls for a fresh CARPET token)
//   4. Cache result in IndexedDB with 5-minute TTL
//
// For a CARPET token fresh off the launchpad this is ~5-15 requests.
// Stays well inside Helius Developer (200 req/sec) even under load.

import { categoriseAddress } from './labels.js';

const HELIUS_KEY = '640a1aca-ce83-419f-9c67-5812da25c21d';
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

const CACHE_DB_NAME    = 'carpet_bubble_cache';
const CACHE_STORE_NAME = 'bubbles';
const CACHE_TTL_MS     = 5 * 60 * 1000;
const MAX_HOLDERS      = 50;
const MAX_SIGNATURES   = 25;

// ── IndexedDB cache ─────────────────────────────────────────────────────────

let dbPromise = null;
function getDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(CACHE_STORE_NAME, { keyPath: 'mint' });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return dbPromise;
}

async function cacheGet(mint) {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
      const req = tx.objectStore(CACHE_STORE_NAME).get(mint);
      req.onsuccess = () => {
        const row = req.result;
        if (!row || (Date.now() - row.fetchedAt > CACHE_TTL_MS)) return resolve(null);
        resolve(row.data);
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function cacheSet(mint, data) {
  try {
    const db = await getDb();
    const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
    tx.objectStore(CACHE_STORE_NAME).put({ mint, fetchedAt: Date.now(), data });
  } catch {}
}

export async function cacheInvalidate(mint) {
  try {
    const db = await getDb();
    const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
    tx.objectStore(CACHE_STORE_NAME).delete(mint);
  } catch {}
}

// ── RPC primitives ──────────────────────────────────────────────────────────

async function rpc(method, params) {
  const res = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

// Batch many RPC calls in a single HTTP request. Helius supports JSON-RPC batch.
async function rpcBatch(calls) {
  const body = calls.map((c, i) => ({
    jsonrpc: '2.0', id: i, method: c.method, params: c.params,
  }));
  const res = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC batch HTTP ${res.status}`);
  const json = await res.json();
  
  // Сортируем по id чтобы порядок совпадал с calls[]
  const sorted = new Array(calls.length).fill(null);
  for (const item of json) {
    if (item.id != null) sorted[item.id] = item.error ? null : item.result;
  }
  return sorted;
}

// ── Primary fetch steps ─────────────────────────────────────────────────────

async function fetchTopHolders(mint) {
  // Returns up to 20 token accounts sorted by balance desc.
  const result = await rpc('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]);
  return result.value.slice(0, MAX_HOLDERS).map(r => ({
    tokenAccount: r.address,
    amount: Number(r.amount),
    uiAmount: r.uiAmount || 0,
    decimals: r.decimals,
  }));
}

async function fetchAccountOwners(tokenAccounts) {
  if (!tokenAccounts.length) return new Map();
  const map = new Map();
  for (let i = 0; i < tokenAccounts.length; i += 20) {  // chunk 20
    const chunk = tokenAccounts.slice(i, i + 20);
    const calls = chunk.map(ta => ({
      method: 'getAccountInfo',
      params: [ta, { encoding: 'jsonParsed', commitment: 'confirmed' }],
    }));
    const results = await rpcBatch(calls);
    results.forEach((r, j) => {
      const owner = r?.value?.data?.parsed?.info?.owner || null;
      map.set(chunk[j], owner);
    });
  }
  return map;
}

async function fetchSignatures(address, limit = MAX_SIGNATURES) {
  const sigs = await rpc('getSignaturesForAddress', [address, { limit }]);
  return sigs.map(s => s.signature);
}

async function fetchParsedTxs(signatures) {
  if (!signatures.length) return [];
  const chunks = [];
  for (let i = 0; i < signatures.length; i += 10) chunks.push(signatures.slice(i, i + 10));
  const all = [];
  for (const chunk of chunks) {
    const calls = chunk.map(sig => ({
      method: 'getTransaction',
      params: [sig, {
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      }],
    }));
    const results = await rpcBatch(calls);
    all.push(...results.filter(Boolean));
  }
  return all;
}

// Extract SPL transfer edges of the given mint from parsed txs.
// Returns list of { from, to, amount, signature, blockTime, instructionIdx }.
function extractTransfers(parsedTxs, mint) {
  const out = [];
  for (const tx of parsedTxs) {
    if (!tx || tx.meta?.err) continue;
    const signature = tx.transaction?.signatures?.[0];
    const blockTime = tx.blockTime || 0;

    // Walk all instructions including inner instructions.
    const allIx = [];
    (tx.transaction?.message?.instructions || []).forEach(ix => allIx.push(ix));
    (tx.meta?.innerInstructions || []).forEach(inner => {
      (inner.instructions || []).forEach(ix => allIx.push(ix));
    });

    let ixIdx = 0;
    for (const ix of allIx) {
      ixIdx += 1;
      const parsed = ix.parsed;
      if (!parsed || ix.program !== 'spl-token') continue;

      // transferChecked includes mint; transfer does not. Use both.
      const type = parsed.type;
      if (type !== 'transfer' && type !== 'transferChecked') continue;

      const info = parsed.info;
      // For "transferChecked" we can verify mint directly.
      if (type === 'transferChecked' && info.mint !== mint) continue;

      // For "transfer" (no mint field) we need pre/post token balances to confirm.
      if (type === 'transfer') {
        const pre  = tx.meta?.preTokenBalances  || [];
        const post = tx.meta?.postTokenBalances || [];
        const mintSeen = [...pre, ...post].some(b => b.mint === mint);
        if (!mintSeen) continue;
      }

      const amount = Number(info.tokenAmount?.amount ?? info.amount ?? 0);
      if (!amount) continue;

      out.push({
        from: info.authority || info.source,  // wallet owner, not token account
        to:   info.destination,               // token account (will resolve below)
        amount,
        signature,
        blockTime,
      });
    }
  }
  return out;
}

// Resolve any token-account addresses in edges to their owner wallets.
async function resolveOwners(edges) {
  const tokenAccounts = new Set();
  for (const e of edges) tokenAccounts.add(e.to);
  const arr = [...tokenAccounts];
  if (!arr.length) return edges;

  const map = new Map();
  for (let i = 0; i < arr.length; i += 50) {  // было 100
    const chunk = arr.slice(i, i + 50);
    const calls = chunk.map(ta => ({
      method: 'getAccountInfo',
      params: [ta, { encoding: 'jsonParsed', commitment: 'confirmed' }],
    }));
    const results = await rpcBatch(calls);
    results.forEach((r, j) => {
      const owner = r?.value?.data?.parsed?.info?.owner || chunk[j];
      map.set(chunk[j], owner);
    });
  }
  return edges.map(e => ({ ...e, to: map.get(e.to) || e.to }));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch full bubble-map data for a mint.
 * @param {string} mint — token mint address
 * @param {object} [opts]
 * @param {boolean} [opts.force] — bypass cache
 * @returns {Promise<{ mint, totalSupply, holders, edges, labels, fetchedAt }>}
 */
export async function fetchBubbleData(mint, { force = false } = {}) {
  if (!force) {
    const cached = await cacheGet(mint);
    if (cached) return cached;
  }

  // Parallel-kick the first two calls we can run independently.
  const [rawHolders, sigs] = await Promise.all([
    fetchTopHolders(mint),
    fetchSignatures(mint),
  ]);

  if (!rawHolders.length) {
    const empty = { mint, totalSupply: 0, holders: [], edges: [], labels: {}, fetchedAt: Date.now() };
    await cacheSet(mint, empty);
    return empty;
  }

  // Resolve token accounts → owner wallets.
  const ownersMap = await fetchAccountOwners(rawHolders.map(h => h.tokenAccount));

  const totalSupply = rawHolders.reduce((a, h) => a + h.amount, 0);
  const holders = rawHolders.map(h => {
    const owner = ownersMap.get(h.tokenAccount) || h.tokenAccount;
    return {
      address: owner,
      amount: h.amount,
      uiAmount: h.uiAmount,
      bps: totalSupply > 0 ? Math.round((h.amount / totalSupply) * 10_000) : 0,
      decimals: h.decimals,
    };
  });

  // Fetch parsed txs and extract transfer edges.
  const parsed = await fetchParsedTxs(sigs);
  const rawEdges = extractTransfers(parsed, mint);
  const edges = await resolveOwners(rawEdges);

  // Build labels map — only for nodes we know.
  const labels = {};
  const allAddrs = new Set();
  holders.forEach(h => allAddrs.add(h.address));
  edges.forEach(e => { allAddrs.add(e.from); allAddrs.add(e.to); });
  for (const a of allAddrs) {
    const cat = categoriseAddress(a);
    labels[a] = cat;
  }

  const data = { mint, totalSupply, holders, edges, labels, fetchedAt: Date.now() };
  await cacheSet(mint, data);
  return data;
}
