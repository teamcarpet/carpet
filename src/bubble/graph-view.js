// src/bubble/graph-view.js
// Orchestrates the full graph view: fetch → transform → render → interact.

import { fetchBubbleData, cacheInvalidate } from './data/fetcher.js';
import { buildGraph }        from './data/transformer.js';
import { CanvasRenderer, shorten } from './render/canvas.js';
import { createSimulation, reheat } from './render/forces.js';
import { attachZoom }        from './render/zoom.js';
import { AddressList }       from './ui/address-list.js';
import { InfoPanel }         from './ui/info-panel.js';
import { getTokens }         from '../platform.js';

export class GraphView {
  constructor(host, { mint, onBack }) {
    this.host   = host;
    this.mint   = mint;
    this.onBack = onBack;
    this._loading = true;

    this.el = document.createElement('div');
    this.el.className = 'bm-graph-view';
    host.appendChild(this.el);

    this._renderShell();
    this._load();
  }

  _renderShell() {
    const tokens = getTokens() || [];
    const token  = tokens.find(t => t.mint === this.mint) || {};
    const title  = token.tk ? `$${token.tk}` : shorten(this.mint, 6);
    const subtitle = token.n || 'Token';

    this.el.innerHTML = `
      <div class="bm-gv-topbar">
        <button class="bm-gv-back" data-act="back">← Back</button>
        <div class="bm-gv-title">
          <span class="bm-gv-tk">${title}</span>
          <span class="bm-gv-n">${subtitle}</span>
        </div>
        <div class="bm-gv-tools">
          <button data-act="zoom-in"  title="Zoom in">+</button>
          <button data-act="zoom-out" title="Zoom out">−</button>
          <button data-act="reset"    title="Reset view">⟲</button>
          <button data-act="refresh"  title="Refresh data">↻</button>
        </div>
      </div>
      <div class="bm-gv-body">
        <div class="bm-gv-canvas-wrap">
          <canvas class="bm-gv-canvas"></canvas>
          <div class="bm-gv-info-anchor"></div>
          <div class="bm-gv-status"></div>
        </div>
        <div class="bm-gv-sidebar"></div>
      </div>
    `;

    this.canvas     = this.el.querySelector('.bm-gv-canvas');
    this.status     = this.el.querySelector('.bm-gv-status');
    this.infoAnchor = this.el.querySelector('.bm-gv-info-anchor');
    this.sidebar    = this.el.querySelector('.bm-gv-sidebar');

    this.renderer = new CanvasRenderer(this.canvas);
    this.zoomCtl  = attachZoom(this.canvas, this.renderer);
    this.infoPanel = new InfoPanel(this.infoAnchor);
    this.addrList  = new AddressList(this.sidebar, {
      onSelect: (addr) => this._focusNode(addr),
    });

    this.el.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'back')     this.onBack?.();
      if (act === 'zoom-in')  this.zoomCtl.zoomIn();
      if (act === 'zoom-out') this.zoomCtl.zoomOut();
      if (act === 'reset')    this.zoomCtl.reset();
      if (act === 'refresh')  this._refresh();
    });

    // Click on canvas → hit-test → focus node.
    this.canvas.addEventListener('click', e => {
      const rect = this.canvas.getBoundingClientRect();
      const n = this.renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (n) this._focusNode(n.id);
      else this._clearFocus();
    });
  }

  async _load() {
    this._setStatus('Fetching on-chain data…');
    try {
      const raw = await fetchBubbleData(this.mint);
      if (!raw.holders.length) {
        this._setStatus('No holders found for this mint yet.');
        return;
      }
      const graph = buildGraph(raw);
      this.graph = graph;

      this.sim = createSimulation(graph.nodes, graph.links, {
        onTick: () => this.renderer.requestDraw(),
      });

      this.renderer.setData(graph.nodes, graph.links);
      this.addrList.setData(graph.nodes);
      this._setStatus(`${graph.meta.holderCount} holders · ${graph.meta.linkCount} transfer flows`);
    } catch (err) {
      console.error('[bubble] load failed', err);
      this._setStatus(`Failed to load: ${err.message}`);
    }
  }

  async _refresh() {
    await cacheInvalidate(this.mint);
    this.sim?.stop();
    this._load();
  }

  _focusNode(id) {
    const node = this.graph?.nodes.find(n => n.id === id);
    if (!node) return;
    this.renderer.setHighlight(id);
    this.infoPanel.show(node, this.graph);
    this.addrList.setActive(id);
    // Gently push the node to center. Actual coords become stable after sim settles.
    if (node.x != null && node.y != null) {
      this.zoomCtl.focusOn(node.x, node.y, 1.4);
    }
    reheat(this.sim, 0.15);
  }

  _clearFocus() {
    this.renderer.setHighlight(null);
    this.infoPanel.hide();
  }

  _setStatus(txt) {
    this.status.textContent = txt;
    this.status.style.opacity = txt ? 1 : 0;
  }

  destroy() {
    this.sim?.stop();
    this.zoomCtl?.destroy();
    this.renderer?.destroy();
    this.el.remove();
  }
}
