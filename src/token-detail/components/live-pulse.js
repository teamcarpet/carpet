// src/token-detail/components/live-pulse.js
// Live token board — replaces candle charts.
//   • rolling-digit market cap / price
//   • GPU price line (1s…15m steps) that glides with the clock and flashes
//     green on buys, red on sells
//   • live stats grid + trade tape
// Prices come straight from the bonding curve over websockets
// (onAccountChange + onLogs on the pool), history from the indexer.

import { PublicKey } from '@solana/web3.js';
import { esc } from '../../escape.js';
import { CONFIG } from '../../config.js';
import { getBondingPoolPda, getConnection, getReadOnlyProgram, solscanTxUrl } from '../../launchpad.js';
import { createLiveChart } from '../live/gl-chart.js';
import { PriceSeries, STEPS } from '../live/series.js';
import { Odometer } from '../live/odometer.js';

const TAPE_MAX = 6;
const SOL_PRICE_URL = 'https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112';
const TOKEN_INFO_MS = 20_000;

function fmtSol(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (n >= 100) return n.toFixed(1);
  return n.toFixed(2);
}

// 0.0000000412 → "0.0₇412" — readable at memecoin prices.
function fmtPrice(n) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1) return n.toFixed(4);
  const exp = Math.floor(Math.log10(n));
  const zeros = -exp - 1;
  if (zeros < 4) return n.toFixed(zeros + 4);
  const digits = String(Math.round(n * 10 ** (-exp + 3))).slice(0, 4);
  const sub = String(zeros).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[d]).join('');
  return `0.0${sub}${digits}`;
}

function fmtUsd(n) {
  if (!Number.isFinite(n)) return '';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  if (n >= 1) return '$' + n.toFixed(2);
  return '$' + n.toPrecision(3);
}

const fmtPct = (n) => `${n >= 0 ? '+' : ''}${(Number.isFinite(n) ? n : 0).toFixed(2)}%`;
const shortAddr = (s) => (s && s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s || '');
const fmtClock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export class LivePulse {
  constructor(host, { mint, onTrade }) {
    this.host = host;
    this.mint = mint;
    this.onTrade = onTrade;      // forwards chain trades to the trades table
    this.mode = 'mcap';          // 'mcap' | 'price'
    this.series = new PriceSeries(mint);
    this.stepKey = STEPS[0].key;
    this.tape = [];
    this.solUsd = null;
    this.supply = null;
    this.decimals = 6;
    this.curve = null;           // { progress, raisedSol, targetSol, migrated }
    this.info = {};              // holders, 24h volume from the indexer
    this.scrub = null;
    this.accountSub = null;
    this.logsSub = null;

    this._renderShell();
    this.odometer = new Odometer(this.el.value);
    this.chart = createLiveChart(this.el.canvas, {
      source: (now) => (this.series.price != null ? this.series.view(now, this._scale()) : null),
      onScrub: (s) => this._onScrub(s),
    });
    this.host.addEventListener('click', (e) => this._onClick(e));
    this._start();
  }

  setInfo() { /* everything is read live from the curve and the indexer */ }

  _scale() { return this.mode === 'mcap' && this.supply ? this.supply : 1; }

  // ── Data ──────────────────────────────────────────────────────────────
  async _start() {
    try {
      this.connection = getConnection();
      this.program = getReadOnlyProgram(this.connection);
      this.poolPda = getBondingPoolPda(new PublicKey(this.mint));
      const [pool, supply] = await Promise.all([
        this.program.account.bondingCurvePool.fetch(this.poolPda),
        this.connection.getTokenSupply(new PublicKey(this.mint)),
      ]);
      this.decimals = supply.value.decimals;
      this.supply = Number(supply.value.uiAmountString ?? supply.value.uiAmount);
      const price = this._applyPool(pool);
      await this.series.load(this.stepKey, price);
      this._subscribe();
    } catch (err) {
      console.warn('[live] pool unavailable', err);
      this.el.status.textContent = 'No bonding curve for this token';
    }
    this._refresh();
    this._loadSolUsd();
    this._loadTokenInfo();
    this.infoTimer = setInterval(() => this._loadTokenInfo(), TOKEN_INFO_MS);
    if (location.hostname === 'localhost' && new URLSearchParams(location.search).has('livedemo')) this._demo();
    // Numbers that depend on the clock (window stats) tick every second.
    this.clockTimer = setInterval(() => this._refresh(), 1000);
  }

  _subscribe() {
    this.accountSub = this.connection.onAccountChange(this.poolPda, (info) => {
      try {
        this.series.setPrice(this._applyPool(this.program.coder.accounts.decode('bondingCurvePool', info.data)));
        this._refresh();
      } catch (err) { console.warn('[live] pool decode failed', err); }
    }, 'confirmed');

    this.logsSub = this.connection.onLogs(this.poolPda, (entry) => {
      if (entry.err) return;
      for (const line of entry.logs) {
        if (!line.startsWith('Program data: ')) continue;
        let evt;
        try { evt = this.program.coder.events.decode(line.slice(14)); } catch { continue; }
        // Anchor 0.30 names events "TokensBought", 0.31+ "tokensBought".
        const name = evt?.name?.toLowerCase();
        if (name === 'tokensbought' || name === 'tokenssold') this._onTradeEvent(evt.data, name === 'tokensbought', entry.signature);
      }
    }, 'confirmed');

    // Some RPC websockets drop silently — re-read the pool now and then.
    this.pollTimer = setInterval(async () => {
      try {
        this.series.setPrice(this._applyPool(await this.program.account.bondingCurvePool.fetch(this.poolPda)));
        this._refresh();
      } catch {}
    }, 15_000);
  }

  _applyPool(pool) {
    const vsr = Number(pool.virtualSolReserves.toString());
    const vtr = Number(pool.virtualTokenReserves.toString());
    const raised = Number(pool.realSolReserves.toString());
    const target = Number(pool.migrationTarget.toString());
    this.curve = {
      progress: target ? Math.min(100, (raised / target) * 100) : 0,
      raisedSol: raised / 1e9,
      targetSol: target / 1e9,
      migrated: Boolean(pool.isMigrated),
    };
    return (vsr / 1e9) / (vtr / 10 ** this.decimals);
  }

  _onTradeEvent(d, isBuy, signature) {
    const sol = Number((d.solAmount ?? d.sol_amount).toString()) / 1e9;
    // new_price = virtual_sol * 1e9 / virtual_tokens (base units).
    const price = Number((d.newPrice ?? d.new_price).toString()) * 10 ** this.decimals / 1e18;
    const trade = {
      signature,
      account: (isBuy ? d.buyer : d.seller).toBase58(),
      type: isBuy ? 'buy' : 'sell',
      side: isBuy ? 'buy' : 'sell',
      amountSol: sol,
      amountToken: Number((d.tokenAmount ?? d.token_amount).toString()) / 10 ** this.decimals,
      timestamp: Number(d.timestamp.toString()),
    };
    this.series.addTrade({ t: Date.now(), price, side: trade.side, sol });
    // Bigger trades fire a stronger pulse; 1 SOL+ is a full flash.
    this.chart.pulse(trade.side, Math.min(1, sol));
    this.tape.unshift(trade);
    if (this.tape.length > TAPE_MAX) this.tape.length = TAPE_MAX;
    this._renderTape();
    this._refresh(trade.side);
    this.onTrade?.(trade);
  }

  // Local QA only (localhost + ?livedemo): synthetic trades to exercise the
  // animations without spending devnet SOL.
  _demo() {
    const tick = () => {
      if (!this.series.price) return;
      const isBuy = Math.random() < 0.58;
      const sol = Math.random() < 0.15 ? 1 + Math.random() * 3 : Math.random() * 0.4;
      const price = this.series.price * (1 + (isBuy ? 1 : -1) * sol * 0.012);
      this.series.addTrade({ t: Date.now(), price, side: isBuy ? 'buy' : 'sell', sol });
      this.chart.pulse(isBuy ? 'buy' : 'sell', Math.min(1, sol));
      this.tape.unshift({ signature: '', account: 'Demo' + Math.random().toString(36).slice(2, 8), type: isBuy ? 'buy' : 'sell', amountSol: sol });
      this.tape.length = Math.min(this.tape.length, TAPE_MAX);
      this._renderTape();
      this._refresh(isBuy ? 'buy' : 'sell');
      this.demoTimer = setTimeout(tick, 400 + Math.random() * 1600);
    };
    this.demoTimer = setTimeout(tick, 800);
  }

  async _loadSolUsd() {
    try {
      const data = await (await fetch(SOL_PRICE_URL)).json();
      const usd = Number(Object.values(data)[0]?.usdPrice);
      if (Number.isFinite(usd)) { this.solUsd = usd; this._refresh(); }
    } catch { /* USD line is optional */ }
  }

  async _loadTokenInfo() {
    try {
      const res = await fetch(`${CONFIG.apiUrl}/token?mint=${this.mint}`);
      if (res.ok) { this.info = await res.json(); this._refresh(); }
    } catch { /* indexer offline */ }
  }

  // ── Rendering ─────────────────────────────────────────────────────────
  _renderShell() {
    const tabs = STEPS.map((s, i) => `<button data-act="step" data-val="${s.key}" class="${i === 0 ? 'on' : ''}">${s.key}</button>`).join('');
    this.host.innerHTML = `
      <div class="td-card lb">
        <div class="lb-head">
          <div class="lb-live"><span class="lb-dot"></span>LIVE</div>
          <div class="lb-toggle">
            <button data-act="mode" data-val="mcap" class="on">Market cap</button>
            <button data-act="mode" data-val="price">Price</button>
          </div>
        </div>

        <div class="lb-value-row">
          <div class="lb-value-line"><span class="lb-value"></span><span class="lb-unit">SOL</span></div>
          <div class="lb-sub">
            <span class="lb-change"></span>
            <span class="lb-usd"></span>
            <span class="lb-when"></span>
          </div>
        </div>

        <div class="lb-chart">
          <canvas class="lb-canvas" aria-label="Live price line"></canvas>
          <div class="lb-scrub" hidden><div class="lb-scrub-line"></div><div class="lb-scrub-time"></div></div>
        </div>

        <div class="lb-steps" role="tablist">${tabs}</div>

        <div class="lb-stats">
          <div class="lb-stat" data-k="mcap"><span>Market cap</span><b>—</b></div>
          <div class="lb-stat" data-k="price"><span>Price</span><b>—</b></div>
          <div class="lb-stat" data-k="vol"><span>Volume · <i class="lb-win">1 min</i></span><b>—</b></div>
          <div class="lb-stat" data-k="flow"><span>Buys / Sells</span><b>—</b></div>
          <div class="lb-stat" data-k="holders"><span>Holders</span><b>—</b></div>
          <div class="lb-stat" data-k="vol24"><span>Volume 24h</span><b>—</b></div>
        </div>

        <div class="lb-progress">
          <div class="lb-progress-bar"><div class="lb-progress-fill"></div></div>
          <div class="lb-progress-lbl lb-status">Connecting to the curve…</div>
        </div>

        <div class="lb-tape"><div class="lb-tape-empty">Waiting for the next trade…</div></div>
      </div>
    `;
    const q = (s) => this.host.querySelector(s);
    this.el = {
      card: q('.lb'), value: q('.lb-value'), change: q('.lb-change'), usd: q('.lb-usd'),
      when: q('.lb-when'), canvas: q('.lb-canvas'), scrub: q('.lb-scrub'), scrubTime: q('.lb-scrub-time'),
      fill: q('.lb-progress-fill'), status: q('.lb-status'), tape: q('.lb-tape'), win: q('.lb-win'),
    };
  }

  _refresh(tradeSide) {
    const price = this.series.price;
    if (price == null) return;
    const scale = this._scale();
    const now = Date.now();
    const shown = this.scrub ? this.scrub.value : price * scale;

    this.odometer.set(this.mode === 'mcap' ? fmtSol(shown) : fmtPrice(shown));
    this.el.usd.textContent = this.solUsd ? `≈ ${fmtUsd(shown * this.solUsd)}` : '';

    const { buys, sells, vol, change } = this.series.stats(now);
    const ref = this.series.view(now).ref;
    const pct = this.scrub && ref ? ((this.scrub.value / scale - ref) / ref) * 100 : change;
    const dir = pct > 0.0001 ? 1 : pct < -0.0001 ? -1 : 0;
    this.el.change.textContent = `${dir > 0 ? '▲' : dir < 0 ? '▼' : '◆'} ${fmtPct(pct)}`;
    this.el.change.className = `lb-change ${dir > 0 ? 'up' : dir < 0 ? 'dn' : ''}`;
    this.el.when.textContent = this.scrub ? fmtClock(this.scrub.time) : `past ${this._windowLabel()}`;
    // Line colour follows the period's result, not the scrubbed point.
    this.chart.setTone(change > 0.0001 ? 1 : change < -0.0001 ? -1 : 0);

    if (tradeSide) {
      this.el.card.classList.remove('flash-buy', 'flash-sell');
      void this.el.card.offsetWidth;
      this.el.card.classList.add(tradeSide === 'buy' ? 'flash-buy' : 'flash-sell');
    }

    this._setStat('mcap', `${fmtSol(price * (this.supply || 0))} SOL`);
    this._setStat('price', fmtPrice(price));
    this._setStat('vol', `${vol.toFixed(2)} SOL`);
    this._setStat('flow', `<em class="up">${buys}</em> / <em class="dn">${sells}</em>`, true);
    this._setStat('holders', this.info.holders != null ? String(this.info.holders) : '—');
    this._setStat('vol24', this.info.volume24h != null ? `${Number(this.info.volume24h).toFixed(2)} SOL` : '—');

    if (this.curve) {
      this.el.fill.style.width = `${this.curve.progress}%`;
      this.el.status.textContent = this.curve.migrated
        ? 'Graduated to Meteora'
        : `${this.curve.progress.toFixed(1)}% to graduation · ${this.curve.raisedSol.toFixed(2)} / ${this.curve.targetSol.toFixed(0)} SOL`;
    }
  }

  _windowLabel() {
    const ms = this.series.windowMs;
    if (ms < 60_000) return `${ms / 1000}s`;
    if (ms < 3_600_000) return `${ms / 60_000} min`;
    return `${ms / 3_600_000} h`;
  }

  // Updates one stat cell and flashes it when the value changed.
  _setStat(key, value, html = false) {
    const cell = this.host.querySelector(`.lb-stat[data-k="${key}"]`);
    const b = cell?.querySelector('b');
    if (!b || b.dataset.v === value) return;
    const changed = b.dataset.v != null;
    b.dataset.v = value;
    if (html) b.innerHTML = value; else b.textContent = value;
    if (changed) {
      cell.classList.remove('bump');
      void cell.offsetWidth;
      cell.classList.add('bump');
    }
  }

  _renderTape() {
    this.el.tape.innerHTML = this.tape.map(t => `
      <a class="lb-chip ${t.type === 'buy' ? 'up' : 'dn'}" href="${esc(solscanTxUrl(t.signature))}" target="_blank" rel="noopener">
        <span>${t.type === 'buy' ? '▲ Buy' : '▼ Sell'}</span>
        <b>${esc(t.amountSol.toFixed(3))} SOL</b>
        <span class="lb-chip-who">${esc(shortAddr(t.account))}</span>
      </a>
    `).join('');
  }

  _onScrub(s) {
    this.scrub = s;
    this.el.scrub.hidden = !s;
    if (s) {
      this.el.scrub.style.transform = `translateX(${s.x}px)`;
      this.el.scrub.style.setProperty('--y', `${s.y}px`);
      this.el.scrubTime.textContent = fmtClock(s.time);
    }
    this._refresh();
  }

  async _onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'mode') {
      this.mode = btn.dataset.val;
      this.host.querySelectorAll('[data-act="mode"]').forEach(b => b.classList.toggle('on', b === btn));
      this.chart.resetRange();
      this._refresh();
    } else if (btn.dataset.act === 'step') {
      if (btn.dataset.val === this.stepKey) return;
      this.stepKey = btn.dataset.val;
      this.host.querySelectorAll('[data-act="step"]').forEach(b => b.classList.toggle('on', b === btn));
      await this.series.load(this.stepKey, this.series.price);
      this.chart.resetRange();
      this.el.win.textContent = this._windowLabel();
      this._refresh();
    }
  }

  destroy() {
    if (this.accountSub != null) this.connection.removeAccountChangeListener(this.accountSub).catch(() => {});
    if (this.logsSub != null) this.connection.removeOnLogsListener(this.logsSub).catch(() => {});
    clearInterval(this.pollTimer);
    clearInterval(this.clockTimer);
    clearInterval(this.infoTimer);
    clearTimeout(this.demoTimer);
    this.chart.destroy();
    this.host.innerHTML = '';
  }
}
