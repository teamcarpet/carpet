// src/token-detail/components/chart-embed.js
// TradingView Charting Library wrapper.
//
// Behaviour:
//   1. Detects whether TradingView library is loaded (`window.TradingView`).
//   2. If yes — instantiates widget against our custom Datafeed.
//   3. If not — shows a placeholder that auto-retries every 3 seconds
//      for up to 10 attempts, so as soon as the library script loads,
//      the chart initializes without requiring a page reload.
//
// Integration:
//   - Drop the TradingView Charting Library files into /public/charting_library/
//   - Add `<script src="/charting_library/charting_library.js"></script>` to index.html
//     (either before the main module or anywhere — module detects at runtime)

import { createDatafeed } from '../data/tv-datafeed.js';

const MAX_LIB_WAIT_MS  = 30_000;
const LIB_CHECK_EVERY  = 500;

export class ChartEmbed {
  constructor(host, { mint }) {
    this.host = host;
    this.mint = mint;
    this.resolution = '1';
    this.priceMode  = 'mcap';
    this.widget     = null;
    this._libCheckTimer = null;
    this._elapsed = 0;
    this._render();
    this._tryInit();
  }

  setResolution(res) {
    this.resolution = res;
    if (this.widget?.setSymbol) {
      this.widget.setSymbol(this.mint, res, () => {});
    }
  }

  setPriceMode(mode) {
    this.priceMode = mode;
    // Downstream: datafeed will use this for the symbol key → force reload.
    if (this.widget?.setSymbol) {
      this.widget.setSymbol(`${this.mint}:${mode}`, this.resolution, () => {});
    }
  }

  _render() {
    this.host.innerHTML = `
      <div class="td-chart-wrap">
        <div class="td-chart" id="td-chart-mount"></div>
        <div class="td-chart-status" id="td-chart-status">
          <div class="td-chart-status-title">Chart loading…</div>
          <div class="td-chart-status-sub">Waiting for chart library</div>
        </div>
      </div>
    `;
  }

  _tryInit() {
    // Check library presence on every tick, up to MAX_LIB_WAIT_MS.
    const check = () => {
      this._elapsed += LIB_CHECK_EVERY;
      if (typeof window.TradingView !== 'undefined' && window.TradingView.widget) {
        this._initWidget();
        return;
      }
      if (this._elapsed >= MAX_LIB_WAIT_MS) {
        this._showLibraryMissing();
        return;
      }
      this._libCheckTimer = setTimeout(check, LIB_CHECK_EVERY);
    };
    check();
  }

  _initWidget() {
    const mount = this.host.querySelector('#td-chart-mount');
    const status = this.host.querySelector('#td-chart-status');
    if (status) status.style.display = 'none';
    if (!mount) return;

    try {
      this.widget = new window.TradingView.widget({
        symbol:     this.mint,
        interval:   this.resolution,
        container:  mount,
        library_path: '/charting_library/',
        datafeed:   createDatafeed(this.mint),
        locale:     'en',
        autosize:   true,
        theme:      'dark',
        timezone:   'Etc/UTC',
        toolbar_bg: 'transparent',
        enabled_features:  ['hide_left_toolbar_by_default'],
        disabled_features: [
          'use_localstorage_for_settings',
          'header_symbol_search',
          'header_compare',
          'header_undo_redo',
          'header_saveload',
          'header_screenshot',
          'display_market_status',
          'popup_hints',
        ],
        custom_css_url:  '/charting_library/custom-carpet.css',
        loading_screen:  { backgroundColor: 'transparent' },
        overrides: {
          'paneProperties.background':            'rgba(11,15,24,0)',
          'paneProperties.backgroundType':        'solid',
          'paneProperties.vertGridProperties.color':  'rgba(255,255,255,0.03)',
          'paneProperties.horzGridProperties.color':  'rgba(255,255,255,0.03)',
          'scalesProperties.textColor':           '#9ba0ad',
          'mainSeriesProperties.candleStyle.upColor':          '#00E5A0',
          'mainSeriesProperties.candleStyle.downColor':        '#FF2D2D',
          'mainSeriesProperties.candleStyle.borderUpColor':    '#00E5A0',
          'mainSeriesProperties.candleStyle.borderDownColor':  '#FF2D2D',
          'mainSeriesProperties.candleStyle.wickUpColor':      '#00E5A0',
          'mainSeriesProperties.candleStyle.wickDownColor':    '#FF2D2D',
        },
      });
    } catch (err) {
      console.error('[chart-embed] widget init failed', err);
      this._showError(err.message);
    }
  }

  _showLibraryMissing() {
    const status = this.host.querySelector('#td-chart-status');
    if (!status) return;
    status.innerHTML = `
      <div class="td-chart-status-title">Chart library not loaded</div>
      <div class="td-chart-status-sub">
        Add TradingView Charting Library files to
        <code>/public/charting_library/</code> to enable the chart.
      </div>
    `;
  }

  _showError(msg) {
    const status = this.host.querySelector('#td-chart-status');
    if (!status) return;
    status.style.display = 'flex';
    status.innerHTML = `
      <div class="td-chart-status-title">Chart error</div>
      <div class="td-chart-status-sub">${msg}</div>
    `;
  }

  destroy() {
    clearTimeout(this._libCheckTimer);
    if (this.widget?.remove) {
      try { this.widget.remove(); } catch {}
    }
    this.widget = null;
    this.host.innerHTML = '';
  }
}
