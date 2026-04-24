// src/bubble/data/labels.js
// Known Solana addresses — programs, DEXes, CEX deposit wallets.
// Used to categorise nodes in the bubble graph.
//
// Category contract is an on-chain program (smart contract).
// Category dex is a DEX aggregator or AMM pool wallet.
// Category cex is a centralized exchange hot/deposit wallet.
// Unknown addresses default to "wallet" (EOA) category.

export const CATEGORY_COLORS = {
  wallet:    { fill: '#FF2D2D', glow: 'rgba(255,45,45,.35)' }, // red — EOA holder
  contract:  { fill: '#9945FF', glow: 'rgba(153,69,255,.35)' }, // purple — program
  dex:       { fill: '#00E5A0', glow: 'rgba(0,229,160,.35)'  }, // green  — DEX/AMM
  cex:       { fill: '#00D9FF', glow: 'rgba(0,217,255,.35)'  }, // cyan   — CEX
  carpet:    { fill: '#FFB800', glow: 'rgba(255,184,0,.45)'  }, // amber  — CARPET protocol
  burn:      { fill: '#555555', glow: 'rgba(85,85,85,.35)'   }, // grey   — burn address
};

// CARPET program addresses (our own) ─────────────────────────────────────────
const CARPET_ADDRESSES = {
  'DywpVp5YfLiX4M3xfEp333Y2dmq8xywdNAYaWDw6v9XV': { name: 'CARPET Launchpad',   category: 'carpet' },
};

// Meteora DAMM v2 and related ────────────────────────────────────────────────
const METEORA_ADDRESSES = {
  'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG':  { name: 'Meteora DAMM v2',    category: 'dex' },
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB': { name: 'Meteora DLMM',       category: 'dex' },
};

// Jupiter aggregator ─────────────────────────────────────────────────────────
const JUPITER_ADDRESSES = {
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4':  { name: 'Jupiter v6',         category: 'dex' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN':  { name: 'Jupiter v5',         category: 'dex' },
};

// Raydium (in case migration changes) ────────────────────────────────────────
const RAYDIUM_ADDRESSES = {
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': { name: 'Raydium CPMM',       category: 'dex' },
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': { name: 'Raydium AMM v4',     category: 'dex' },
};

// Common CEX deposit clusters (non-exhaustive; add as needed) ────────────────
const CEX_ADDRESSES = {
  '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9':  { name: 'Binance',            category: 'cex' },
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM':  { name: 'Binance 2',          category: 'cex' },
  'FxteHmLwG9nk1eL4pjNve3Eub2goGkkz6g6TbvdmW46a':  { name: 'OKX',                category: 'cex' },
  '4c5AGV1W6P8tCvdKnR7zW3m1AKaqHGp4eBcSSFK9rBR5':  { name: 'OKX 2',              category: 'cex' },
  'u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w':   { name: 'Gate.io',            category: 'cex' },
  '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S':  { name: 'Bybit',              category: 'cex' },
  'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS':  { name: 'Coinbase',           category: 'cex' },
  '5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD':  { name: 'Coinbase 2',         category: 'cex' },
  'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS':  { name: 'Kraken',             category: 'cex' },
  'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE':  { name: 'Kucoin',             category: 'cex' },
  'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2':  { name: 'Bitget',             category: 'cex' },
};

// Known burn / null addresses ────────────────────────────────────────────────
const BURN_ADDRESSES = {
  '1nc1nerator11111111111111111111111111111111':  { name: 'Incinerator',        category: 'burn' },
  '11111111111111111111111111111111':              { name: 'System Program',     category: 'contract' },
  'deaddeaddeaddeaddeaddeaddeaddeaddeaddead':      { name: 'Dead Wallet',        category: 'burn' },
};

export const LABELS = {
  ...CARPET_ADDRESSES,
  ...METEORA_ADDRESSES,
  ...JUPITER_ADDRESSES,
  ...RAYDIUM_ADDRESSES,
  ...CEX_ADDRESSES,
  ...BURN_ADDRESSES,
};

export function getLabel(address) {
  return LABELS[address] || null;
}

export function categoriseAddress(address, isContract = false) {
  const label = getLabel(address);
  if (label) return { category: label.category, name: label.name };
  if (isContract) return { category: 'contract', name: null };
  return { category: 'wallet', name: null };
}
