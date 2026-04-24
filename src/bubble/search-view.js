// src/bubble/search-view.js
// Two-column landing view for Bubble Map:
//   - Trending Tokens:  CARPET tokens by volume × (1 + age bonus)
//   - Featured Tokens:  CARPET tokens newest first (with market cap)
//
// Rows click through to graph-view for that mint.

import { getTokens } from '../platform.js';

function fmtMoney(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

function fmtPct(n) {
  if (n == null) return '';
  const cls = n >= 0 ? 'up' : 'dn';
  const sign = n >= 0 ? '+' : '';
  return `<span class="bm-sv-pct ${cls}">${sign}${n.toFixed(2)}%</span>`;
}

function rankTrending(tokens) {
  // Pure volume-based (24h vol as stored). No decay needed — all CARPET tokens
  // are young. If vol is identical, newer wins.
  return [...tokens]
    .filter(t => t.mint)
    .sort((a, b) => {
      const v = (b.vol || 0) - (a.vol || 0);
      return v !== 0 ? v : (b.createdAt || 0) - (a.createdAt || 0);
    })
    .slice(0, 20);
}

function rankFeatured(tokens) {
  // Newest mints first — showcases fresh launches.
  return [...tokens]
    .filter(t => t.mint)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 20);
}

function renderRow(t) {
  const mc  = fmtMoney(t.mc);
  const vol = fmtMoney(t.vol);
  const img = t.imageUrl
    ? `<img src="${t.imageUrl}" class="bm-sv-img" alt="">`
    : `<div class="bm-sv-emoji">${t.em || '🎯'}</div>`;
  return `
    <div class="bm-sv-row" data-mint="${t.mint}">
      ${img}
      <div class="bm-sv-col-name">
        <div class="bm-sv-tk">${t.tk || '???'}</div>
        <div class="bm-sv-n">${t.n || 'Unnamed'}</div>
      </div>
      <div class="bm-sv-col-vol">${vol}</div>
      <div class="bm-sv-col-mc">
        <div class="bm-sv-mc">${mc}</div>
        ${fmtPct(t.pct)}
      </div>
    </div>
  `;
}

function renderColumn(title, list) {
  if (!list.length) {
    return `
      <div class="bm-sv-card">
        <div class="bm-sv-card-h">${title}</div>
        <div class="bm-sv-empty">No tokens yet — launch the first one.</div>
      </div>
    `;
  }
  return `
    <div class="bm-sv-card">
      <div class="bm-sv-card-h">${title}</div>
      <div class="bm-sv-grid">
        <div class="bm-sv-hd">Token</div>
        <div class="bm-sv-hd">Volume</div>
        <div class="bm-sv-hd">Market Cap / Price</div>
      </div>
      <div class="bm-sv-list">${list.map(renderRow).join('')}</div>
    </div>
  `;
}

export class SearchView {
  constructor(host, { onPick }) {
    this.host   = host;
    this.onPick = onPick;
    this.el = document.createElement('div');
    this.el.className = 'bm-search-view';
    host.appendChild(this.el);

    this.el.addEventListener('click', e => {
      const row = e.target.closest('[data-mint]');
      if (!row) return;
      this.onPick?.(row.dataset.mint);
    });
    this.el.addEventListener('input', e => {
      if (e.target.matches('.bm-sv-search')) this._applyFilter(e.target.value);
    });

    // React to tokens arriving via platform events.
    this._updateHandler = () => this.render();
    window.addEventListener('platform:token-added',  this._updateHandler);
    window.addEventListener('platform:token-updated', this._updateHandler);

    this.render();
  }

  render() {
    const all = getTokens();
    const trending = rankTrending(all);
    const featured = rankFeatured(all);

    this.el.innerHTML = `
      <div class="bm-sv-top">
        <input class="bm-sv-search" type="text" placeholder="🔍  Search Tokens (Name, Ticker, Address)" />
      </div>
      <div class="bm-sv-cols">
        ${renderColumn('Trending Tokens', trending)}
        ${renderColumn('Featured Tokens', featured)}
      </div>
    `;
  }

  _applyFilter(q) {
    q = q.trim().toLowerCase();
    const rows = this.el.querySelectorAll('.bm-sv-row');
    rows.forEach(r => {
      if (!q) { r.style.display = ''; return; }
      const mint = r.dataset.mint.toLowerCase();
      const name = r.querySelector('.bm-sv-n')?.textContent.toLowerCase() || '';
      const tk   = r.querySelector('.bm-sv-tk')?.textContent.toLowerCase() || '';
      const hit = mint.includes(q) || name.includes(q) || tk.includes(q);
      r.style.display = hit ? '' : 'none';
    });
  }

  destroy() {
    window.removeEventListener('platform:token-added',  this._updateHandler);
    window.removeEventListener('platform:token-updated', this._updateHandler);
    this.el.remove();
  }
}
