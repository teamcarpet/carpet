// src/token-detail/data/trades-fetcher.js
// Live trades client for the Carpet indexer.
//
// Backend contract (https://api.carpet.fun):
//
//   GET /trades?mint=X&limit=N&minSol=0.05
//     → 200 { trades: [{ account, type, amountSol, amountToken, timestamp, signature }, ...] }
//        type: 'buy' | 'sell'
//        timestamp: unix seconds
//
//   WS wss://api.carpet.fun/trades-stream?mint=X&minSol=0.05
//     → server pushes { type: 'trade', trade: {...} } for each new trade.

const API_ROOT = 'https://api.carpet.fun';

export async function fetchTrades({ mint, limit = 100, minSol = 0 }) {
  try {
    const params = new URLSearchParams({ mint, limit: String(limit) });
    if (minSol > 0) params.set('minSol', String(minSol));
    const res = await fetch(`${API_ROOT}/trades?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.trades) ? data.trades : [];
  } catch {
    return [];
  }
}

// ── WebSocket streaming ─────────────────────────────────────────────────────

export function subscribeTrades({ mint, minSol = 0, onTrade, onOpen, onClose }) {
  let ws;
  let retryTimer = null;
  let retries = 0;
  const maxRetries = 5;
  let closed = false;

  const connect = () => {
    if (closed) return;
    const url = `${API_ROOT.replace(/^http/, 'ws')}/trades-stream?mint=${mint}${minSol ? `&minSol=${minSol}` : ''}`;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }

    ws.onopen  = () => { retries = 0; onOpen?.(); };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'trade' && msg.trade) onTrade(msg.trade);
      } catch {}
    };
    ws.onclose = () => {
      onClose?.();
      if (closed || retries >= maxRetries) return;
      retries += 1;
      retryTimer = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** retries));
    };
  };

  connect();

  return {
    close() {
      closed = true;
      if (ws) { try { ws.close(); } catch {} }
      if (retryTimer) clearTimeout(retryTimer);
    },
  };
}
