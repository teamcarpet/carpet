// src/token-detail/components/top-holders.js
// Right-sidebar list of top token holders.
// Reuses the already-built Helius data layer from the bubble module.

import { fetchBubbleData } from '../../bubble/data/fetcher.js';

function shorten(s, n = 4) {
  if (!s || s.length < 12) return s || '';
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

function fmtPct(bps) {
  if (bps == null) return '—';
  if (bps < 1) return '< 0.01%';
  return `${(bps / 100).toFixed(2)}%`;
}

export class TopHolders {
  constructor(host, { mint }) {
    this.host = host;
    this.mint = mint;
    this.state = 'loading';
    this.holders = [];
    this._render();
    this._load();
  }

  async _load() {
    try {
      const data = await fetchBubbleData(this.mint);
      this.holders = data?.holders || [];
      this.state = this.holders.length ? 'ready' : 'empty';
    } catch (err) {
      console.warn('[top-holders] fetch failed', err);
      this.state = 'error';
    }
    this._render();
  }

  _render() {
    if (this.state === 'loading') {
      this.host.innerHTML = `
        <div class="td-card td-holders">
          <div class="td-holders-head">
            <span>Top holders</span>
            <a href="#" class="td-holders-link" data-act="bubble">Bubble map</a>
          </div>
          <div class="td-holders-empty">Loading…</div>
        </div>
      `;
      return;
    }
    if (this.state === 'empty' || this.state === 'error') {
      this.host.innerHTML = `
        <div class="td-card td-holders">
          <div class="td-holders-head">
            <span>Top holders</span>
            <a href="#" class="td-holders-link" data-act="bubble">Bubble map</a>
          </div>
          <div class="td-holders-empty">
            ${this.state === 'error' ? 'Failed to load holders' : 'No holder data yet'}
          </div>
        </div>
      `;
      return;
    }

    const top = this.holders.slice(0, 20);
    this.host.innerHTML = `
      <div class="td-card td-holders">
        <div class="td-holders-head">
          <span>Top holders</span>
          <a href="#" class="td-holders-link" data-act="bubble">Bubble map</a>
        </div>
        <div class="td-holders-list">
          ${top.map((h, i) => `
            <div class="td-holders-row" data-addr="${h.address}">
              <span class="td-holders-rank">#${i + 1}</span>
              <span class="td-holders-addr">${shorten(h.address, 4)}</span>
              <span class="td-holders-pct">${fmtPct(h.bps)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  destroy() { this.host.innerHTML = ''; }
}
