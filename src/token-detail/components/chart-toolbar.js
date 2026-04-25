// src/token-detail/components/chart-toolbar.js
// Toolbar above the chart — timeframe switcher + display toggles.
// Emits events through on(event, handler). Does not own chart state.

const RESOLUTIONS = [
  { id: '1',    label: '1m'  },
  { id: '5',    label: '5m'  },
  { id: '15',   label: '15m' },
  { id: '60',   label: '1H'  },
  { id: '240',  label: '4H'  },
  { id: 'D',    label: '1D'  },
];

export class ChartToolbar {
  constructor(host) {
    this.host = host;
    this.resolution = '1';     // default 1m
    this.priceMode  = 'mcap';  // 'mcap' | 'price'
    this.unit       = 'usd';   // 'usd'  | 'sol'
    this.listeners  = {};
    this._render();
    this.host.addEventListener('click', (e) => this._onClick(e));
  }

  on(event, handler) {
    (this.listeners[event] ||= []).push(handler);
  }

  _emit(event, value) {
    for (const h of this.listeners[event] || []) h(value);
  }

  _render() {
    const resTabs = RESOLUTIONS.map(r =>
      `<button class="td-tb-res ${r.id === this.resolution ? 'on' : ''}"
               data-act="res" data-val="${r.id}">${r.label}</button>`
    ).join('');

    this.host.innerHTML = `
      <div class="td-toolbar">
        <div class="td-tb-left">
          <div class="td-tb-resolutions">${resTabs}</div>
        </div>
        <div class="td-tb-right">
          <div class="td-tb-seg">
            <button class="td-tb-opt ${this.priceMode === 'price' ? 'on' : ''}" data-act="price-mode" data-val="price">Price</button>
            <button class="td-tb-opt ${this.priceMode === 'mcap'  ? 'on' : ''}" data-act="price-mode" data-val="mcap">MCap</button>
          </div>
          <div class="td-tb-seg">
            <button class="td-tb-opt ${this.unit === 'usd' ? 'on' : ''}" data-act="unit" data-val="usd">USD</button>
            <button class="td-tb-opt ${this.unit === 'sol' ? 'on' : ''}" data-act="unit" data-val="sol">SOL</button>
          </div>
        </div>
      </div>
    `;
  }

  _onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const val = t.dataset.val;
    if (act === 'res') {
      this.resolution = val;
      this._render();
      this._emit('resolutionChange', val);
    } else if (act === 'price-mode') {
      this.priceMode = val;
      this._render();
      this._emit('priceModeChange', val);
    } else if (act === 'unit') {
      this.unit = val;
      this._render();
      this._emit('unitChange', val);
    }
  }

  destroy() {
    this.listeners = {};
    this.host.innerHTML = '';
  }
}
