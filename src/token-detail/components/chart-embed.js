// src/token-detail/components/chart-embed.js
// Lightweight Charts wrapper for token price/mcap visualization.

import { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers } from 'lightweight-charts';
import { fetchCandles, subscribeCandles, unsubscribeCandles } from '../data/candles-fetcher.js';
import { fetchTrades } from '../data/trades-fetcher.js';

const COLOR = {
  up:           '#22ab94',
  down:         '#f23645',
  bg:           'transparent',
  text:         '#b2b5be',
  grid:         'rgba(255,255,255,0.04)',
  border:       'rgba(255,255,255,0.08)',
  volumeUp:     'rgba(34,171,148,0.55)',
  volumeDown:   'rgba(242,54,69,0.55)',
};

export class ChartEmbed {
  constructor(host, { mint, creator }) {
    this.host         = host;
    this.mint         = mint;
    this.creator      = creator || null;
    this.resolution   = '1';
    this.priceMode    = 'mcap';
    this.subUID       = `chart-${mint}-${Date.now()}`;
    this.chart        = null;
    this.candleSeries = null;
    this.volumeSeries = null;
    this.markersApi   = null;
    this._resizeObs   = null;

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
    if (this.markersApi) {
      try { this.markersApi.detach(); } catch {}
      this.markersApi = null;
    }
       if (this._tooltipEl) {
      this._tooltipEl.remove();
      this._tooltipEl = null;
    }
    this._devMarkerData = null;
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
        barSpacing: 8,
        minBarSpacing: 4,
        rightOffset: 8,
      },
      rightPriceScale: {
        borderColor: COLOR.border,
        scaleMargins: { top: 0.08, bottom: 0.28 },
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

    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'vol',
    });
    this.chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
      borderVisible: false,
    });

    this._resizeObs = new ResizeObserver(() => {
      if (!this.chart) return;
      this.chart.applyOptions({ width: mount.clientWidth, height: mount.clientHeight });
    });
    this._resizeObs.observe(mount);
  }

  async _loadAndSubscribe() {
    const status = this.host.querySelector('#td-chart-status');
    if (status) status.style.display = 'flex';

    unsubscribeCandles(this.subUID);

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
      if (status) {
        status.innerHTML = `<div style="font-size:13px;color:var(--muted);letter-spacing:1px;">No price data yet</div>`;
      }
      this.candleSeries.setData([]);
      this.volumeSeries.setData([]);
      return;
    }

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

    this.chart.timeScale().fitContent();

    subscribeCandles({
      subscriberUID: this.subUID,
      mint:          this.mint,
      resolution:    this.resolution,
      priceMode:     this.priceMode,
      onTick:        (bar) => this._applyTick(bar),
    });

    this._loadDevMarkers();
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

  // ── Dev (creator) trade markers ─────────────────────────────────────────
// ── Dev (creator) trade markers ─────────────────────────────────────────
  async _loadDevMarkers() {
    if (!this.candleSeries) return;

    try {
      const trades = await fetchTrades({ mint: this.mint, limit: 500 });
      // TEMP: pretend MockWallet02 is the creator (revert before commit)
      const fakeCreator = 'MockWallet02xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const devTrades = trades.filter(t => t.account === fakeCreator);
      if (!devTrades.length) return;

      // Group by candle bucket (resolution-aware) and side, so we don't
      // stack multiple markers on the same candle.
      const bucketSec = this._bucketSeconds();
      const groups = new Map();
      for (const t of devTrades) {
        const bucket = Math.floor(t.timestamp / bucketSec) * bucketSec;
        const key = `${bucket}-${t.side}`;
        const g = groups.get(key) || {
          time: bucket,
          side: t.side,
          totalSol: 0,
          totalToken: 0,
          mcAtTime: t.marketCap || 0,
          count: 0,
        };
        g.totalSol   += Number(t.amountSol)   || 0;
        g.totalToken += Number(t.amountToken) || 0;
        g.count      += 1;
        groups.set(key, g);
      }

      // Save grouped data for tooltip lookup
      this._devMarkerData = new Map();
      const markers = [];
      for (const g of groups.values()) {
        const key = `${g.time}-${g.side}`;
        this._devMarkerData.set(key, g);
        markers.push({
          time:     g.time,
          position: g.side === 'buy' ? 'belowBar' : 'aboveBar',
          color:    g.side === 'buy' ? COLOR.up : COLOR.down,
          shape:    'circle',
          text:     g.side === 'buy' ? 'DB' : 'DS',
          size:     1.2,
        });
      }

      // Sort by time ascending (Lightweight Charts requires this)
      markers.sort((a, b) => a.time - b.time);

      if (this.markersApi) {
        this.markersApi.setMarkers(markers);
      } else {
        this.markersApi = createSeriesMarkers(this.candleSeries, markers);
      }

      this._initDevTooltip();
    } catch (err) {
      console.warn('[chart] dev markers failed:', err.message);
    }
  }

  _bucketSeconds() {
    // Map resolution string to seconds
    const map = { '1': 60, '5': 300, '15': 900, '60': 3600, '240': 14400, '1D': 86400 };
    return map[this.resolution] || 60;
  }

  _initDevTooltip() {
    if (this._tooltipEl) return;          // already initialized
    if (!this.host || !this.chart) return;

    const tip = document.createElement('div');
    tip.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 1000;
      background: rgba(11, 15, 24, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      padding: 8px 10px;
      font-family: var(--mono);
      font-size: 11px;
      color: #eef0f5;
      letter-spacing: 0.3px;
      white-space: nowrap;
      transform: translate(-50%, -110%);
      display: none;
      backdrop-filter: blur(6px);
    `;
    this.host.querySelector('.td-chart-wrap').appendChild(tip);
    this._tooltipEl = tip;

    this.chart.subscribeCrosshairMove(param => {
      if (!param || !param.time || !this._devMarkerData) {
        tip.style.display = 'none';
        return;
      }

      // Look up marker at this time, both sides
      const buyKey  = `${param.time}-buy`;
      const sellKey = `${param.time}-sell`;
      const data = this._devMarkerData.get(buyKey) || this._devMarkerData.get(sellKey);
      if (!data) {
        tip.style.display = 'none';
        return;
      }

      // Format: "Dev bought 0.45 SOL · $4K MCap"
      const verb = data.side === 'buy' ? 'bought' : 'sold';
      const sol  = data.totalSol.toFixed(3);
      const mc   = this._fmtUsd(data.mcAtTime);
      const cnt  = data.count > 1 ? ` (${data.count} trades)` : '';
      tip.innerHTML = `
        <div style="color:${data.side === 'buy' ? COLOR.up : COLOR.down};font-weight:700;">
          Dev ${verb}${cnt}
        </div>
        <div style="margin-top:3px;color:#b2b5be;">${sol} SOL · ${mc} MCap</div>
      `;

      tip.style.display = 'block';
      tip.style.left = `${param.point.x}px`;
      tip.style.top  = `${param.point.y}px`;
    });
  }

  _fmtUsd(v) {
    if (!v || v < 1) return '$0';
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${Math.round(v)}`;
  }
}
