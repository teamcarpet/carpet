import { CONFIG } from './config.js';
import { getPublicKey, signAndSendVersionedTransaction } from './wallet.js';

const API = CONFIG.jupiterApiUrl;

export async function getQuote({ inputMint, outputMint, amount, slippageBps = 50 }) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(Math.floor(amount)),
    slippageBps: String(slippageBps),
    feeBps: String(CONFIG.platformFeeBps),
    feeAccount: CONFIG.feeWallet || undefined,
  });
  if (!CONFIG.feeWallet) {
    params.delete('feeBps');
    params.delete('feeAccount');
  }
  const res = await fetch(`${API}/quote?${params}`);
  if (!res.ok) throw new Error(`Jupiter quote failed: ${await res.text()}`);
  return res.json();
}

export async function buildSwapTransaction(quoteResponse) {
  const pubkey = getPublicKey();
  if (!pubkey) throw new Error('Wallet not connected');
  const res = await fetch(`${API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: pubkey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap build failed: ${await res.text()}`);
  const data = await res.json();
  return data.swapTransaction;
}

export async function executeSwap(quoteResponse) {
  const swapTx = await buildSwapTransaction(quoteResponse);
  return signAndSendVersionedTransaction(swapTx);
}

export async function getTokenInfo(mint) {
  try {
    const res = await fetch(`https://tokens.jup.ag/token/${mint}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function searchTokens(query) {
  try {
    const res = await fetch(`https://tokens.jup.ag/tokens?query=${encodeURIComponent(query)}&strict=false`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export function formatAmount(raw, decimals) {
  return Number(raw) / Math.pow(10, decimals);
}

export function toRawAmount(amount, decimals) {
  return Math.floor(Number(amount) * Math.pow(10, decimals));
}
