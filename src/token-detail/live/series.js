// src/token-detail/live/series.js
// Price line data for one step size (1s…15m): history from the indexer's
// /series, then live trades straight from the chain. Buckets without trades
// carry the previous price forward, so the line keeps moving with the clock.

import { CONFIG } from '../../config.js';

export const STEPS = [
  { key: '1s',  ms: 1_000 },
  { key: '5s',  ms: 5_000 },
  { key: '30s', ms: 30_000 },
  { key: '1m',  ms: 60_000 },
  { key: '5m',  ms: 300_000 },
  { key: '15m', ms: 900_000 },
];

const POINTS = 60;

export class PriceSeries {
  constructor(mint) {
    this.mint = mint;
    this.step = STEPS[0];
    this.buckets = [];       // { t, v, buys, sells, vol } — t = bucket start (ms)
    this.price = null;       // latest known price (SOL per token)
    this.version = 0;        // bumps on every change, cheap dirty check
  }

  get windowMs() { return POINTS * this.step.ms; }

  async load(stepKey, fallbackPrice) {
    // Swap step and buckets together once the history arrives, so the chart
    // never draws old buckets against the new time axis.
    const step = STEPS.find(s => s.key === stepKey) ?? STEPS[0];
    const stepMs = step.ms;
    const end = Math.floor(Date.now() / stepMs) * stepMs;
    const start = end - (POINTS - 1) * stepMs;

    let history = null;
    try {
      const res = await fetch(`${CONFIG.apiUrl}/series?mint=${this.mint}&step=${step.key}&points=${POINTS}`);
      if (res.ok) history = await res.json();
    } catch { /* indexer offline — start flat from the curve price */ }

    const byT = new Map((history?.points ?? []).map(p => [p.t * 1000, p]));
    let v = history?.seed ?? history?.points?.[0]?.close ?? this.price ?? fallbackPrice ?? null;
    const buckets = [];
    for (let t = start; t <= end; t += stepMs) {
      const p = byT.get(t);
      if (p) v = p.close;
      buckets.push({ t, v, buys: p?.buys ?? 0, sells: p?.sells ?? 0, vol: p?.vol ?? 0 });
    }
    // Trades that arrived live while the request was in flight stay authoritative.
    if (this.price != null) buckets[buckets.length - 1].v = this.price;
    else if (v != null) this.price = v;
    if (buckets[0].v == null) for (const b of buckets) b.v = this.price;

    this.step = step;
    this.buckets = buckets;
    this.version++;
  }

  /** Current price from the curve (account change / initial fetch). */
  setPrice(price) {
    if (!Number.isFinite(price)) return;
    this.price = price;
    this._extendTo(Date.now());
    const last = this.buckets[this.buckets.length - 1];
    if (last) last.v = price;
    if (this.buckets.length && this.buckets[0].v == null) for (const b of this.buckets) b.v = price;
    this.version++;
  }

  addTrade({ t, price, side, sol }) {
    this._extendTo(t);
    const stepMs = this.step.ms;
    const bt = Math.floor(t / stepMs) * stepMs;
    const b = this.buckets.find(x => x.t === bt) ?? this.buckets[this.buckets.length - 1];
    if (!b) return;
    if (side === 'buy') b.buys++; else b.sells++;
    b.vol += sol || 0;
    if (Number.isFinite(price)) {
      // Only the latest bucket moves the head; a late trade for an older bucket
      // updates that bucket's close but not the current price.
      b.v = price;
      if (b === this.buckets[this.buckets.length - 1]) this.price = price;
    }
    this.version++;
  }

  _extendTo(now) {
    if (!this.buckets.length) return;
    const stepMs = this.step.ms;
    const target = Math.floor(now / stepMs) * stepMs;
    let last = this.buckets[this.buckets.length - 1];
    while (last.t < target) {
      last = { t: last.t + stepMs, v: last.v, buys: 0, sells: 0, vol: 0 };
      this.buckets.push(last);
    }
    if (this.buckets.length > POINTS + 2) this.buckets.splice(0, this.buckets.length - (POINTS + 2));
  }

  /** Chart source: closes at bucket ends, plus the live head at `now`. */
  view(now, scale = 1) {
    this._extendTo(now);
    const stepMs = this.step.ms;
    const points = [];
    for (const b of this.buckets) {
      if (b.v == null) continue;
      points.push({ t: Math.min(b.t + stepMs, now), v: b.v * scale });
    }
    if (this.price != null) points.push({ t: now, v: this.price * scale });
    const first = this.buckets.find(b => b.t >= now - this.windowMs && b.v != null);
    return { points, windowMs: this.windowMs, ref: first ? first.v * scale : null };
  }

  /** Activity in the visible window. */
  stats(now = Date.now()) {
    const from = now - this.windowMs;
    let buys = 0, sells = 0, vol = 0;
    for (const b of this.buckets) {
      if (b.t < from) continue;
      buys += b.buys; sells += b.sells; vol += b.vol;
    }
    const first = this.buckets.find(b => b.t >= from && b.v != null);
    const change = first && this.price ? ((this.price - first.v) / first.v) * 100 : 0;
    return { buys, sells, vol, change };
  }
}
