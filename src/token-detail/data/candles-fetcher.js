// src/token-detail/data/candles-fetcher.js
// REST + WebSocket client for OHLCV candles from the Carpet indexer.
//
// Backend contract (https://api.carpet.fun):
//
//   GET /candles?mint=X&resolution=R&from=T1&to=T2&priceMode=mcap|price&countBack=N
//     → 200 { bars: [{ time, open, high, low, close, volume }, ...] }
//        time: unix seconds
//        OHLC: numbers (USD or SOL depending on priceMode)
//        volume: number (token units)
//
//   WS wss://api.carpet.fun/stream?mint=X&resolution=R&priceMode=M
//     → server pushes { type: 'bar', bar: { time, open, high, low, close, volume } }
//        every time a new candle closes or the current candle updates.
//
// Until the backend exists fetchCandles returns [] and subscribeCandles is a no-op.
// No hardcoded data. No fake bars. Empty = empty.

const API_ROOT = 'https://api.carpet.fun';

// ── REST ────────────────────────────────────────────────────────────────────

export async function fetchCandles({ mint, resolution, from, to, countBack, priceMode = 'mcap' }) {
  try {
    const params = new URLSearchParams({
      mint,
      resolution,
      from: String(from),
      to:   String(to),
      priceMode,
    });
    if (countBack) params.set('countBack', String(countBack));

    const res = await fetch(`${API_ROOT}/candles?${params}`, { method: 'GET' });
    if (!res.ok) {
      // 404 is a valid "not tracked yet" — don't spam the console.
      if (res.status !== 404) console.warn(`[candles] HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data?.bars) ? data.bars : [];
  } catch (err) {
    // Backend not reachable — silently return no data.
    // The chart will show its "no data" state, which is the intended behaviour.
    return [];
  }
}

// ── WebSocket subscriptions ─────────────────────────────────────────────────

const subs = new Map();  // subscriberUID → { ws, retryTimer, retries }

export function subscribeCandles({ subscriberUID, mint, resolution, priceMode, onTick }) {
  unsubscribeCandles(subscriberUID);

  let retries = 0;
  const maxRetries = 5;

  const connect = () => {
    const url = `${API_ROOT.replace(/^http/, 'ws')}/stream?mint=${mint}&resolution=${resolution}&priceMode=${priceMode}`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      return;  // Backend not reachable, silent fail.
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'bar' && msg.bar) onTick(msg.bar);
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      if (!subs.has(subscriberUID)) return;      // already unsubscribed
      if (retries >= maxRetries) return;
      retries += 1;
      const delay = Math.min(30_000, 1_000 * 2 ** retries);
      const retryTimer = setTimeout(connect, delay);
      subs.set(subscriberUID, { ws: null, retryTimer, retries });
    };

    ws.onerror = () => {
      // Close handler will trigger reconnection. No action needed.
    };

    subs.set(subscriberUID, { ws, retryTimer: null, retries });
  };

  connect();
}

export function unsubscribeCandles(subscriberUID) {
  const entry = subs.get(subscriberUID);
  if (!entry) return;
  if (entry.ws) {
    try { entry.ws.close(); } catch {}
  }
  if (entry.retryTimer) clearTimeout(entry.retryTimer);
  subs.delete(subscriberUID);
}
