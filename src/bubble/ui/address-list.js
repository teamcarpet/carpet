// src/bubble/ui/address-list.js
// Right sidebar showing top holders, searchable.
// Clicking a row focuses the node on the graph.

import { shorten } from '../render/canvas.js';
import { CATEGORY_COLORS } from '../data/labels.js';

export class AddressList {
  constructor(host, { onSelect } = {}) {
    this.host = host;
    this.onSelect = onSelect;
    this.nodes = [];
    this.query = '';
    this.activeId = null;

    this.el = document.createElement('div');
    this.el.className = 'bm-addrlist';
    host.appendChild(this.el);

    this.el.addEventListener('input', e => {
      if (e.target.matches('.bm-al-search')) {
        this.query = e.target.value.toLowerCase();
        this._renderRows();
      }
    });
    this.el.addEventListener('click', e => {
      const row = e.target.closest('[data-addr]');
      if (!row) return;
      const addr = row.dataset.addr;
      this.setActive(addr);
      this.onSelect?.(addr);
    });
  }

  setData(nodes) {
    // Sort by bps desc; ties broken by category priority (dex/cex/carpet first).
    const catWeight = { carpet: 0, dex: 1, cex: 2, contract: 3, wallet: 4, burn: 5, unknown: 6 };
    this.nodes = [...nodes].sort((a, b) => {
      if (b.bps !== a.bps) return b.bps - a.bps;
      return (catWeight[a.category] ?? 9) - (catWeight[b.category] ?? 9);
    });
    this._renderAll();
  }

  setActive(addr) {
    this.activeId = addr;
    this.el.querySelectorAll('[data-addr]').forEach(r => {
      r.classList.toggle('on', r.dataset.addr === addr);
    });
    const row = this.el.querySelector(`[data-addr="${addr}"]`);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  _renderAll() {
    this.el.innerHTML = `
      <div class="bm-al-head">
        <div class="bm-al-title">Address List</div>
      </div>
      <input class="bm-al-search" type="text" placeholder="Search" />
      <div class="bm-al-rows" id="bm-al-rows"></div>
    `;
    this._renderRows();
  }

  _renderRows() {
    const rows = this.el.querySelector('#bm-al-rows');
    const q = this.query;
    const list = q
      ? this.nodes.filter(n =>
          n.address.toLowerCase().includes(q) ||
          (n.label && n.label.toLowerCase().includes(q)))
      : this.nodes;

    if (!list.length) {
      rows.innerHTML = `<div class="bm-al-empty">No addresses match</div>`;
      return;
    }

    rows.innerHTML = list.map((n, i) => {
      const cat = CATEGORY_COLORS[n.category] || CATEGORY_COLORS.wallet;
      const rank = i + 1;
      const display = n.label || shorten(n.address);
      const bps = n.bps === 0 ? '< 0.01%' : `${(n.bps / 100).toFixed(2)}%`;
      const active = n.id === this.activeId ? ' on' : '';
      return `
        <div class="bm-al-row${active}" data-addr="${n.id}">
          <span class="bm-al-rank">#${rank}</span>
          <span class="bm-al-dot" style="background:${cat.fill};"></span>
          <span class="bm-al-name">${display}</span>
          <span class="bm-al-bps">${bps}</span>
        </div>
      `;
    }).join('');
  }
}
