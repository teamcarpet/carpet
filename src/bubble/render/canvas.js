// src/bubble/render/canvas.js
// Canvas 2D renderer for the bubble graph.
//
// Architecture decisions:
//   - One canvas element; links drawn first (under), then nodes, then labels.
//   - Transform applied via ctx.setTransform(), driven by d3-zoom state.
//   - Device pixel ratio awareness: internal resolution scales to DPR while
//     CSS size stays stable. This keeps strokes crisp on retina.
//   - Hit-test is a linear pass over nodes — at ~100 nodes this is under
//     0.1ms per call, no spatial index needed yet.
//   - Highlighted node and neighbour set get drawn in a second pass on top
//     of a dimmed background — classic "focus" interaction pattern.

import { CATEGORY_COLORS } from '../data/labels.js';

const LABEL_MIN_RADIUS = 18;      // don't draw labels on tiny nodes
const LABEL_FONT       = '11px ui-monospace, monospace';

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d', { alpha: true });
    this.transform = { k: 1, x: 0, y: 0 };
    this.nodes    = [];
    this.links    = [];
    this.highlightId = null;
    this.highlightNeighbours = new Set();
    this.dpr      = window.devicePixelRatio || 1;
    this._rafId   = 0;
    this._dirty   = false;
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = Math.floor(rect.width  * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);
    this.width  = rect.width;
    this.height = rect.height;
    this.requestDraw();
  }

  setData(nodes, links) {
    this.nodes = nodes;
    this.links = links;
    this.requestDraw();
  }

  setTransform(t) {
    this.transform = { k: t.k, x: t.x, y: t.y };
    this.requestDraw();
  }

  setHighlight(nodeId) {
    this.highlightId = nodeId;
    this.highlightNeighbours.clear();
    if (nodeId) {
      for (const l of this.links) {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        if (s === nodeId) this.highlightNeighbours.add(t);
        if (t === nodeId) this.highlightNeighbours.add(s);
      }
    }
    this.requestDraw();
  }

  /** Converts screen coords (CSS px) to graph coords. */
  screenToGraph(sx, sy) {
    return {
      x: (sx - this.transform.x) / this.transform.k,
      y: (sy - this.transform.y) / this.transform.k,
    };
  }

  /** Returns the node under (sx, sy) in CSS px, or null. */
  hitTest(sx, sy) {
    const { x, y } = this.screenToGraph(sx, sy);
    // Iterate in reverse so topmost (drawn last) wins.
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = n.x - x;
      const dy = n.y - y;
      if (dx * dx + dy * dy <= n.radius * n.radius) return n;
    }
    return null;
  }

  requestDraw() {
    if (this._dirty) return;
    this._dirty = true;
    this._rafId = requestAnimationFrame(() => {
      this._dirty = false;
      this._draw();
    });
  }

  _draw() {
    const { ctx, dpr, width, height, transform, highlightId, highlightNeighbours } = this;
    // Reset + clear.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Apply pan/zoom. Canvas origin is top-left; graph space has (0,0) center.
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);
    ctx.translate(width / 2 / transform.k, height / 2 / transform.k);

    const dimmed = !!highlightId;

    // ── Pass 1: links ──
    ctx.lineCap = 'round';
    for (const l of this.links) {
      const s = l.source, t = l.target;
      if (!s || !t || s.x == null || t.x == null) continue;
      const sId = typeof s === 'object' ? s.id : s;
      const tId = typeof t === 'object' ? t.id : t;
      const related = !dimmed || sId === highlightId || tId === highlightId;
      const alpha   = (l.opacity ?? 0.4) * (related ? 1 : 0.15);
      ctx.strokeStyle = `rgba(238,240,245,${alpha.toFixed(3)})`;
      ctx.lineWidth = (l.width || 1) / Math.sqrt(transform.k); // keep visual width stable
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();

      // Arrowhead on target end, simple triangle.
      if (related && l.width > 1.2) {
        const angle = Math.atan2(t.y - s.y, t.x - s.x);
        const ax = t.x - Math.cos(angle) * (t.radius + 2);
        const ay = t.y - Math.sin(angle) * (t.radius + 2);
        const sz = 4 / Math.sqrt(transform.k);
        ctx.fillStyle = `rgba(238,240,245,${Math.min(1, alpha * 1.4).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - Math.cos(angle - 0.5) * sz * 2, ay - Math.sin(angle - 0.5) * sz * 2);
        ctx.lineTo(ax - Math.cos(angle + 0.5) * sz * 2, ay - Math.sin(angle + 0.5) * sz * 2);
        ctx.closePath();
        ctx.fill();
      }
    }

    // ── Pass 2: nodes ──
    for (const n of this.nodes) {
      if (n.x == null) continue;
      const isHighlight = n.id === highlightId;
      const related = !dimmed || isHighlight || highlightNeighbours.has(n.id);
      const cat = CATEGORY_COLORS[n.category] || CATEGORY_COLORS.wallet;

      // Outer glow.
      ctx.shadowColor = cat.glow;
      ctx.shadowBlur  = isHighlight ? 20 : 8;

      // Fill.
      ctx.fillStyle = cat.fill;
      ctx.globalAlpha = related ? 1 : 0.25;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();

      // Ring for highlighted node.
      if (isHighlight) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / transform.k;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // ── Pass 3: labels (only large nodes, only when zoomed in enough) ──
    if (transform.k > 0.7) {
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(238,240,245,0.92)';
      for (const n of this.nodes) {
        if (n.x == null) continue;
        if (n.radius < LABEL_MIN_RADIUS && !n.label) continue;
        const text = n.label || shorten(n.address);
        ctx.fillText(text, n.x, n.y + n.radius + 10);
      }
    }
  }

  destroy() {
    cancelAnimationFrame(this._rafId);
    this._resizeObserver.disconnect();
  }
}

export function shorten(addr, n = 4) {
  if (!addr || addr.length < 12) return addr || '';
  return `${addr.slice(0, n)}…${addr.slice(-n)}`;
}
