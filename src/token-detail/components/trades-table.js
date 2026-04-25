// src/token-detail/components/trades-table.js
// Live trades table under the chart.
//
// On mount: fetch last N trades, then subscribe to WS stream.
// Every new trade is prepended to the list and the table auto-trims to MAX rows.
//
// Empty state until backend is available.

import { fetchTrades, subscribeTrades } from '../data/trades-fetcher.js';

const MAX_ROWS = 100;

function fmtSol(n)   { return (n ?? 0).toFixed(6); }
function fmtToken(n) {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}
function fmtAgo(ts) {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function shorten(s, n = 4) {
  if (!s || s.length < 12) return s || '';
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

export class TradesTable {
  constructor(host, { mint }) {
    this.host   = host;
    this.mint   = mint;
    this.rows   = [];
    this.minSol = 0;
    this.filter = false;
    this.sub    = null;
    this._tickTimer = null;
    this._renderShell();
    this._load();
    this._startTicker();
    this.host.addEventListener('click', (e) => this._onClick(e));
    this.host.addEventListener('change', (e) => this._onChange(e));
  }

  _renderShell() {
    this.host.innerHTML = `
      <div class="td-card td-trades">
        <div class="td-trades-head">
          <div class="td-trades-title">Trades</div>
          <label class="td-trades-filter">
            <input type="checkbox" data-act="filter-toggle" ${this.filter ? 'checked' : ''}>
            <span>Filter by size</span>
            <input class="td-trades-filter-input"
                   type="number" min="0" step="0.01" value="${this.minSol}"
                   placeholder="0.05 SOL" data-act="filter-size"
                   ${this.filter ? '' : 'disabled'}>
          </label>
        </div>
        <div class="td-trades-grid-head">
          <div>Account</div>
          <div>Type</div>
          <div>Amount (SOL)</div>
          <div>Amount (token)</div>
          <div>Time</div>
          <div>Txn</div>
        </div>
        <div class="td-trades-body" id="td-trades-body">
          ${this._emptyHtml()}
        </div>
      </div>
    `;
  }

  _emptyHtml() {
    return `
      <div class="td-trades-empty">
        <div>Waiting for live trades…</div>
        <small>Trade stream connects to the Carpet indexer</small>
      </div>
    `;
  }

  async _load() {
    const initial = await fetchTrades({ mint: this.mint, limit: MAX_ROWS, minSol: this.filter ? this.minSol : 0 });
    this.rows = initial.slice(0, MAX_ROWS);
    this._renderBody();
    this._subscribe();
  }

  _subscribe() {
    this.sub?.close();
    this.sub = subscribeTrades({
      mint:   this.mint,
      minSol: this.filter ? this.minSol : 0,
      onTrade: (t) => this._onTrade(t),
    });
  }

  _onTrade(trade) {
    this.rows.unshift(trade);
    if (this.rows.length > MAX_ROWS) this.rows.length = MAX_ROWS;
    this._renderBody();
  }

  _renderBody() {
    const body = this.host.querySelector('#td-trades-body');
    if (!body) return;
    if (!this.rows.length) {
      body.innerHTML = this._emptyHtml();
      return;
    }
    body.innerHTML = this.rows.map(r => this._renderRow(r)).join('');
  }

  _renderRow(r) {
    const sideCls = r.type === 'buy' ? 'up' : 'dn';
    return `
      <div class="td-trades-row">
        <div class="td-trades-addr">${shorten(r.account, 5)}</div>
        <div class="td-trades-side ${sideCls}">${r.type?.toUpperCase() || '—'}</div>
        <div>${fmtSol(r.amountSol)}</div>
        <div>${fmtToken(r.amountToken)}</div>
        <div class="td-trades-time" data-ts="${r.timestamp || ''}">${fmtAgo(r.timestamp)}</div>
        <div class="td-trades-txn">
          ${r.signature
            ? `<a href="https://solscan.io/tx/${r.signature}" target="_blank" rel="noopener">${shorten(r.signature, 4)}</a>`
            : '—'}
        </div>
      </div>
    `;
  }

  _startTicker() {
    // Refresh relative timestamps every 15 seconds without re-rendering rows.
    this._tickTimer = setInterval(() => {
      this.host.querySelectorAll('.td-trades-time').forEach(el => {
        const ts = Number(el.dataset.ts);
        if (ts) el.textContent = fmtAgo(ts);
      });
    }, 15_000);
  }

  _onClick(e) {
    // placeholder — currently filter toggle is handled in _onChange.
  }

  _onChange(e) {
    const t = e.target;
    if (t.dataset.act === 'filter-toggle') {
      this.filter = t.checked;
      const input = this.host.querySelector('[data-act="filter-size"]');
      if (input) input.disabled = !this.filter;
      this._load();
    } else if (t.dataset.act === 'filter-size') {
      this.minSol = parseFloat(t.value) || 0;
      this._load();
    }
  }

  destroy() {
    this.sub?.close();
    clearInterval(this._tickTimer);
    this.host.innerHTML = '';
  }
}
