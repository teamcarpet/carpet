// src/bubble/ui/info-panel.js
// Floating panel anchored top-left of the graph view.
// Shows details of the currently selected node.

import { shorten } from '../render/canvas.js';
import { buildNodeFlows } from '../data/transformer.js';
import { CATEGORY_COLORS } from '../data/labels.js';

function fmtAmount(n, decimals = 0) {
  if (n === 0) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toLocaleString();
}

function fmtBps(bps) {
  if (bps === 0) return '< 0.01%';
  if (bps < 1) return '< 0.01%';
  return `${(bps / 100).toFixed(2)}%`;
}

function fmtTime(unix) {
  if (!unix) return '';
  const diff = (Date.now() / 1000 - unix);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export class InfoPanel {
  constructor(host) {
    this.el = document.createElement('div');
    this.el.className = 'bm-info-panel';
    this.el.style.display = 'none';
    host.appendChild(this.el);
    this.el.addEventListener('click', e => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'close') this.hide();
      if (act.dataset.act === 'copy')  this._copy(act.dataset.val);
      if (act.dataset.act === 'solscan') window.open(`https://solscan.io/account/${act.dataset.val}`, '_blank');
    });
  }

  _copy(val) {
    navigator.clipboard.writeText(val).catch(() => {});
  }

  show(node, graph) {
    if (!node) return this.hide();
    const flows = buildNodeFlows(node.id, graph.links);
    const cat = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.wallet;
    const title = node.label || shorten(node.address, 6);
    const catLabel = node.category[0].toUpperCase() + node.category.slice(1);

    this.el.innerHTML = `
      <div class="bm-ip-head">
        <div class="bm-ip-title">
          <span class="bm-ip-dot" style="background:${cat.fill};box-shadow:0 0 8px ${cat.glow};"></span>
          <span class="bm-ip-title-t">${title}</span>
        </div>
        <button class="bm-ip-close" data-act="close" aria-label="Close">×</button>
      </div>
      <div class="bm-ip-addr">
        <code>${shorten(node.address, 6)}</code>
        <button class="bm-ip-icon" data-act="copy" data-val="${node.address}" title="Copy address">⧉</button>
        <button class="bm-ip-icon" data-act="solscan" data-val="${node.address}" title="Open in Solscan">↗</button>
      </div>
      <div class="bm-ip-row">
        <span class="bm-ip-k">Category</span>
        <span class="bm-ip-v">${catLabel}</span>
      </div>
      <div class="bm-ip-row">
        <span class="bm-ip-k">Supply</span>
        <span class="bm-ip-v">${fmtBps(node.bps)}</span>
      </div>
      <div class="bm-ip-row">
        <span class="bm-ip-k">Balance</span>
        <span class="bm-ip-v">${fmtAmount(node.uiAmount)}</span>
      </div>
      <div class="bm-ip-flow bm-ip-in">
        <span class="bm-ip-flow-arr">⬇</span>
        <span class="bm-ip-flow-amt">${fmtAmount(flows.totalIn)}</span>
        <span class="bm-ip-flow-txt">from ${flows.inflows.length} address${flows.inflows.length === 1 ? '' : 'es'}</span>
      </div>
      <div class="bm-ip-flow bm-ip-out">
        <span class="bm-ip-flow-arr">⬆</span>
        <span class="bm-ip-flow-amt">${fmtAmount(flows.totalOut)}</span>
        <span class="bm-ip-flow-txt">to ${flows.outflows.length} address${flows.outflows.length === 1 ? '' : 'es'}</span>
      </div>
      ${flows.inflows.length ? `
        <div class="bm-ip-section">Recent inflows</div>
        ${flows.inflows.slice(0, 5).map(l => `
          <div class="bm-ip-tx">
            <span class="bm-ip-tx-amt">+${fmtAmount(l.amount)}</span>
            <span class="bm-ip-tx-addr">from ${shorten(typeof l.source === 'object' ? l.source.id : l.source)}</span>
            <span class="bm-ip-tx-time">${fmtTime(l.lastBlockTime)}</span>
          </div>
        `).join('')}
      ` : ''}
      ${flows.outflows.length ? `
        <div class="bm-ip-section">Recent outflows</div>
        ${flows.outflows.slice(0, 5).map(l => `
          <div class="bm-ip-tx">
            <span class="bm-ip-tx-amt bm-ip-tx-out">-${fmtAmount(l.amount)}</span>
            <span class="bm-ip-tx-addr">to ${shorten(typeof l.target === 'object' ? l.target.id : l.target)}</span>
            <span class="bm-ip-tx-time">${fmtTime(l.lastBlockTime)}</span>
          </div>
        `).join('')}
      ` : ''}
    `;
    this.el.style.display = 'block';
  }

  hide() {
    this.el.style.display = 'none';
  }
}
