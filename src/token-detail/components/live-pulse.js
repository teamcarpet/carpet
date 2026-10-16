// src/token-detail/components/live-pulse.js
// "Live Cap": one big number instead of a candle chart. Market cap (or price)
// straight from the bonding curve, updated the moment a trade confirms:
//   onAccountChange(pool) → authoritative reserves → new price
//   onLogs(pool)          → TokensBought / TokensSold → side + size for the tape
// Talks to the chain directly, so it keeps working when the indexer is down.

import { PublicKey } from '@solana/web3.js';
import { esc } from '../../escape.js';
import { getBondingPoolPda, getConnection, getReadOnlyProgram, solscanTxUrl } from '../../launchpad.js';

const TAPE_MAX = 6;
const SOL_PRICE_URL = 'https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112';

function fmtSol(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (n >= 100) return n.toFixed(1);
  return n.toFixed(2);
}

function fmtPrice(n) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1) return n.toFixed(4);
  // 0.0000000412 → "0.0₇412": keep it readable at tiny prices.
  const exp = Math.floor(Math.log10(n));
  const zeros = -exp - 1;
  const digits = Math.round(n * 10 ** (-exp + 2));
  if (zeros < 4) return n.toFixed(zeros + 3);
  const sub = String(zeros).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[d]).join('');
  return `0.0${sub}${digits}`;
}

function fmtUsd(n) {
  if (!Number.isFinite(n)) return '';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

function fmtPct(n) {
  if (!Number.isFinite(n)) return '0.00%';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

const shortAddr = (s) => (s && s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s || '');

export class LivePulse {
  constructor(host, { mint, onTrade }) {
    this.host = host;
    this.mint = mint;
    this.onTrade = onTrade;      // forwards chain trades to the trades table
    this.mode = 'mcap';          // 'mcap' | 'price'
    this.state = null;           // { price, supply, decimals, progress, migrated }
    this.open = null;            // first price seen this session
    this.dir = 0;                // last move: 1 up, -1 down
    this.lastChange = 0;
    this.tape = [];
    this.solUsd = null;
    this.accountSub = null;
    this.logsSub = null;
    this.host.addEventListener('click', (e) => this._onClick(e));
    this._renderShell();
    this._start();
  }

  setInfo() { /* metadata isn't needed — everything comes from the curve */ }

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
      this._applyPool(pool, { initial: true });
      this._subscribe();
    } catch (err) {
      console.warn('[live-pulse] pool unavailable', err);
      this._setStatus('No bonding curve for this token');
    }
    this._loadSolUsd();
    this.ageTimer = setInterval(() => this._renderAge(), 1000);
  }

  async _loadSolUsd() {
    try {
      const res = await fetch(SOL_PRICE_URL);
      const data = await res.json();
      const usd = Number(Object.values(data)[0]?.usdPrice);
      if (Number.isFinite(usd)) { this.solUsd = usd; this._renderValue(); }
    } catch { /* USD line is optional */ }
  }

  _subscribe() {
    // Reserves: the source of truth for price.
    this.accountSub = this.connection.onAccountChange(this.poolPda, (info) => {
      try {
        this._applyPool(this.program.coder.accounts.decode('bondingCurvePool', info.data));
      } catch (err) { console.warn('[live-pulse] decode pool failed', err); }
    }, 'confirmed');

    // Trade events: who, which side, how much.
    this.logsSub = this.connection.onLogs(this.poolPda, (entry) => {
      if (entry.err) return;
      for (const line of entry.logs) {
        if (!line.startsWith('Program data: ')) continue;
        let evt;
        try { evt = this.program.coder.events.decode(line.slice(14)); } catch { continue; }
        // Anchor 0.30 names events "TokensBought", 0.31+ "tokensBought".
        const name = evt?.name?.toLowerCase();
        if (name !== 'tokensbought' && name !== 'tokenssold') continue;
        this._onTradeEvent(evt.data, name === 'tokensbought', entry.signature);
      }
    }, 'confirmed');

    // Websockets drop silently on some RPCs; re-read the pool now and then.
    this.pollTimer = setInterval(async () => {
      try { this._applyPool(await this.program.account.bondingCurvePool.fetch(this.poolPda)); } catch {}
    }, 15_000);
  }

  _applyPool(pool, { initial = false } = {}) {
    const vsr = Number(pool.virtualSolReserves.toString());
    const vtr = Number(pool.virtualTokenReserves.toString());
    const raised = Number(pool.realSolReserves.toString());
    const target = Number(pool.migrationTarget.toString());
    const price = (vsr / 1e9) / (vtr / 10 ** this.decimals);

    const prev = this.state?.price;
    this.state = {
      price,
      progress: target ? Math.min(100, (raised / target) * 100) : 0,
      raisedSol: raised / 1e9,
      targetSol: target / 1e9,
      migrated: Boolean(pool.isMigrated),
    };
    if (this.open == null) this.open = price;

    if (!initial && prev != null && price !== prev) {
      this.dir = price > prev ? 1 : -1;
      this.lastChange = Date.now();
      this._flash();
    }
    this._renderValue();
  }

  _onTradeEvent(d, isBuy, signature) {
    const trade = {
      signature,
      account: (isBuy ? d.buyer : d.seller).toBase58(),
      type: isBuy ? 'buy' : 'sell',
      side: isBuy ? 'buy' : 'sell',
      amountSol: Number((d.solAmount ?? d.sol_amount).toString()) / 1e9,
      amountToken: Number((d.tokenAmount ?? d.token_amount).toString()) / 10 ** this.decimals,
      timestamp: Number(d.timestamp.toString()),
    };
    this.tape.unshift(trade);
    if (this.tape.length > TAPE_MAX) this.tape.length = TAPE_MAX;
    this._renderTape();
    this.onTrade?.(trade);
  }

  // ── Rendering ─────────────────────────────────────────────────────────
  _renderShell() {
    this.host.innerHTML = `
      <div class="td-card lp">
        <div class="lp-head">
          <div class="lp-live"><span class="lp-dot"></span>LIVE</div>
          <div class="lp-toggle" role="tablist">
            <button data-act="mode" data-val="mcap" class="on">Market cap</button>
            <button data-act="mode" data-val="price">Price</button>
          </div>
        </div>
        <div class="lp-main">
          <div class="lp-arrow" aria-hidden="true"></div>
          <div class="lp-value-wrap">
            <div class="lp-value" aria-live="polite">—</div>
            <div class="lp-sub"><span class="lp-usd"></span><span class="lp-change"></span></div>
          </div>
        </div>
        <div class="lp-progress">
          <div class="lp-progress-bar"><div class="lp-progress-fill"></div></div>
          <div class="lp-progress-lbl"><span class="lp-progress-pct">—</span><span class="lp-age"></span></div>
        </div>
        <div class="lp-tape"><div class="lp-tape-empty">Waiting for the next trade…</div></div>
      </div>
    `;
    this.el = {
      card: this.host.querySelector('.lp'),
      arrow: this.host.querySelector('.lp-arrow'),
      value: this.host.querySelector('.lp-value'),
      usd: this.host.querySelector('.lp-usd'),
      change: this.host.querySelector('.lp-change'),
      fill: this.host.querySelector('.lp-progress-fill'),
      pct: this.host.querySelector('.lp-progress-pct'),
      age: this.host.querySelector('.lp-age'),
      tape: this.host.querySelector('.lp-tape'),
    };
  }

  _renderValue() {
    const s = this.state;
    if (!s) return;
    const mcSol = s.price * this.supply;
    const isMcap = this.mode === 'mcap';
    this.el.value.textContent = isMcap ? `${fmtSol(mcSol)} SOL` : `${fmtPrice(s.price)} SOL`;
    this.el.usd.textContent = this.solUsd ? `≈ ${fmtUsd((isMcap ? mcSol : s.price) * this.solUsd)}` : '';

    const sessionPct = this.open ? ((s.price - this.open) / this.open) * 100 : 0;
    this.el.change.textContent = `${fmtPct(sessionPct)} since you opened`;
    this.el.change.className = `lp-change ${sessionPct > 0 ? 'up' : sessionPct < 0 ? 'dn' : ''}`;

    this.el.arrow.className = `lp-arrow ${this.dir > 0 ? 'up' : this.dir < 0 ? 'dn' : ''}`;
    this.el.arrow.textContent = this.dir > 0 ? '▲' : this.dir < 0 ? '▼' : '◆';

    this.el.fill.style.width = `${s.progress}%`;
    this.el.pct.textContent = s.migrated
      ? 'Graduated to Meteora'
      : `${s.progress.toFixed(1)}% to graduation · ${s.raisedSol.toFixed(2)} / ${s.targetSol.toFixed(0)} SOL`;
    this._renderAge();
  }

  _renderAge() {
    if (!this.el?.age) return;
    if (!this.lastChange) { this.el.age.textContent = ''; return; }
    const s = Math.floor((Date.now() - this.lastChange) / 1000);
    this.el.age.textContent = s < 2 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
  }

  _renderTape() {
    this.el.tape.innerHTML = this.tape.map(t => `
      <a class="lp-chip ${t.type === 'buy' ? 'up' : 'dn'}" href="${esc(solscanTxUrl(t.signature))}" target="_blank" rel="noopener">
        <span>${t.type === 'buy' ? '▲ Buy' : '▼ Sell'}</span>
        <b>${esc(t.amountSol.toFixed(3))} SOL</b>
        <span class="lp-chip-who">${esc(shortAddr(t.account))}</span>
      </a>
    `).join('');
  }

  _flash() {
    const card = this.el.card;
    card.classList.remove('flash-up', 'flash-dn');
    void card.offsetWidth; // restart the animation
    card.classList.add(this.dir > 0 ? 'flash-up' : 'flash-dn');
  }

  _setStatus(text) {
    this.el.value.textContent = '—';
    this.el.pct.textContent = text;
  }

  _onClick(e) {
    const btn = e.target.closest('[data-act="mode"]');
    if (!btn) return;
    this.mode = btn.dataset.val;
    this.host.querySelectorAll('[data-act="mode"]').forEach(b => b.classList.toggle('on', b === btn));
    this._renderValue();
  }

  destroy() {
    if (this.accountSub != null) this.connection.removeAccountChangeListener(this.accountSub).catch(() => {});
    if (this.logsSub != null) this.connection.removeOnLogsListener(this.logsSub).catch(() => {});
    clearInterval(this.pollTimer);
    clearInterval(this.ageTimer);
    this.host.innerHTML = '';
  }
}
