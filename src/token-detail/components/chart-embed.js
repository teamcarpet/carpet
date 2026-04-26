// src/token-detail/components/chart-embed.js
// Lightweight Charts wrapper for token price/mcap visualization.
//
// Connects to the Carpet indexer via candles-fetcher and subscribes to
// real-time bar updates over WS. Switches between Price and MCap modes
// transparently — datafeed re-fetches with the appropriate priceMode.

import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { fetchCandles, subscribeCandles, unsubscribeCandles } from '../data/candles-fetcher.js';

const COLOR = {
  up:           '#22ab94',     // pump.fun teal-green
  down:         '#f23645',     // pump.fun coral-red
  bg:           'transparent',
  text:         '#b2b5be',     // brighter text for axis
  grid:         'rgba(255,255,255,0.04)',
  border:       'rgba(255,255,255,0.08)',
  volumeUp:     'rgba(34,171,148,0.55)',
  volumeDown:   'rgba(242,54,69,0.55)',
};

export class ChartEmbed {
  constructor(host, { mint }) {
    this.host        = host;
    this.mint        = mint;
    this.resolution  = '1';
    this.priceMode   = 'mcap';
    this.subUID      = `chart-${mint}-${Date.now()}`;
    this.chart       = null;
    this.candleSeries = null;
    this.volumeSeries = null;
    this._resizeObs  = null;

    this._render();
    this._initChart();
    this._loadAndSubscribe();
  }

  // ── Public API ──────────────────────────────────────────────────────────
  setResolution(res) {
    if (res === this.resolution) return;
    this.resolution = res;
    this._loadAndSubscribe();
  }

  setPriceMode(mode) {
    if (mode === this.priceMode) return;
    this.priceMode = mode;
    this._loadAndSubscribe();
  }

  destroy() {
    unsubscribeCandles(this.subUID);
    if (this._resizeObs) this._resizeObs.disconnect();
    if (this.chart) this.chart.remove();
    this.chart = null;
    this.candleSeries = null;
    this.volumeSeries = null;
    this.host.innerHTML = '';
  }

  // ── Internals ───────────────────────────────────────────────────────────
  _render() {
    this.host.innerHTML = `
      <div class="td-chart-wrap" style="position:relative;width:100%;height:100%;">
        <div id="td-chart-mount" style="position:absolute;inset:0;"></div>
        <div id="td-chart-status" class="td-chart-status" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;font-family:var(--mono);">
          <div style="font-size:13px;color:var(--muted);letter-spacing:1px;">Loading chart…</div>
        </div>
      </div>
    `;
  }

  _initChart() {
    const mount = this.host.querySelector('#td-chart-mount');
    if (!mount) return;

    this.chart = createChart(mount, {
  layout: {
    background: { color: COLOR.bg },
    textColor:  COLOR.text,
    fontSize:   12,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  },
  grid: {
    vertLines: { color: COLOR.grid },
    horzLines: { color: COLOR.grid },
  },
  timeScale: {
    borderColor: COLOR.border,
    timeVisible: true,
    secondsVisible: false,
    barSpacing: 8,             // wider candles, like pump.fun
    minBarSpacing: 4,
    rightOffset: 8,
  },
  rightPriceScale: {
    borderColor: COLOR.border,
    scaleMargins: { top: 0.08, bottom: 0.28 },  // give volume more room at bottom
  },
  crosshair: {
    mode: 1,
    vertLine: { color: 'rgba(255,255,255,0.2)', width: 1, style: 3 },
    horzLine: { color: 'rgba(255,255,255,0.2)', width: 1, style: 3 },
  },
  autoSize: true,
});

    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor:        COLOR.up,
      downColor:      COLOR.down,
      borderUpColor:  COLOR.up,
      borderDownColor:COLOR.down,
      wickUpColor:    COLOR.up,
      wickDownColor:  COLOR.down,
    });

    // Volume as a histogram in its own scale at the bottom 25%
    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
  priceFormat:  { type: 'volume' },
  priceScaleId: 'vol',
});
this.chart.priceScale('vol').applyOptions({
  scaleMargins: { top: 0.75, bottom: 0 },
  borderVisible: false,
});

    // Resize chart when host changes size
    this._resizeObs = new ResizeObserver(() => {
      if (!this.chart) return;
      this.chart.applyOptions({ width: mount.clientWidth, height: mount.clientHeight });
    });
    this._resizeObs.observe(mount);
  }

  async _loadAndSubscribe() {
    const status = this.host.querySelector('#td-chart-status');
    if (status) status.style.display = 'flex';

    // Drop any previous subscription before reloading data
    unsubscribeCandles(this.subUID);

    // Fetch a window of historical bars: last 24h roughly, capped at 500.
    const to   = Math.floor(Date.now() / 1000);
    const from = to - 24 * 3600;
    const bars = await fetchCandles({
      mint:       this.mint,
      resolution: this.resolution,
      from, to,
      priceMode:  this.priceMode,
      countBack:  500,
    });

    if (!this.candleSeries || !this.volumeSeries) return;

    if (bars.length === 0) {
      // Show "no data" rather than an empty chart with no scale
      if (status) {
        status.innerHTML = `<div style="font-size:13px;color:var(--muted);letter-spacing:1px;">No price data yet</div>`;
      }
      this.candleSeries.setData([]);
      this.volumeSeries.setData([]);
      return;
    }

    // Lightweight Charts expects ascending time order
    const sorted = [...bars].sort((a, b) => a.time - b.time);

    this.candleSeries.setData(sorted.map(b => ({
      time:  b.time,
      open:  b.open,
      high:  b.high,
      low:   b.low,
      close: b.close,
    })));

    this.volumeSeries.setData(sorted.map(b => ({
      time:  b.time,
      value: b.volume,
      color: b.close >= b.open ? COLOR.volumeUp : COLOR.volumeDown,
    })));

    if (status) status.style.display = 'none';

    // Auto-fit viewport to data
    this.chart.timeScale().fitContent();

    // Live updates via WS — server pushes one bar at a time
    subscribeCandles({
      subscriberUID: this.subUID,
      mint:          this.mint,
      resolution:    this.resolution,
      priceMode:     this.priceMode,
      onTick:        (bar) => this._applyTick(bar),
    });
  }

  _applyTick(bar) {
    if (!this.candleSeries || !this.volumeSeries) return;
    if (!bar || typeof bar.time !== 'number') return;

    this.candleSeries.update({
      time:  bar.time,
      open:  bar.open,
      high:  bar.high,
      low:   bar.low,
      close: bar.close,
    });

    if (typeof bar.volume === 'number') {
      this.volumeSeries.update({
        time:  bar.time,
        value: bar.volume,
        color: bar.close >= bar.open ? COLOR.volumeUp : COLOR.volumeDown,
      });
    }
  }
}