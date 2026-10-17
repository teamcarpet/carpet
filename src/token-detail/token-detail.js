// src/token-detail/token-detail.js
// Entry point for the token detail page.
// Replaces the old openDet()/rdeta() flow from main.js.
//
// Public API:
//   mountTokenDetail(container, { mint, onBack, onTrade })
//   unmountTokenDetail()
//
// The module takes full ownership of `container` — sets innerHTML,
// attaches listeners, runs fetchers. On unmount it cleans everything up.

import { Header }          from './components/header.js';
import { LivePulse }       from './components/live-pulse.js';
import { TradesTable }     from './components/trades-table.js';
import { TradePanel }      from './components/trade-panel.js';
import { InsightsPanel }   from './components/insights.js';
import { CONFIG }          from '../config.js';
import { ChatPanel }       from './components/chat-panel.js';
import { MobileCta }       from './components/mobile-cta.js';
import { fetchTokenInfo }  from './data/token-info-fetcher.js';

let activeView = null;

class TokenDetailView {
  constructor(container, { mint, onBack, onTrade }) {
    this.container = container;
    this.mint      = mint;
    this.onBack    = onBack;
    this.onTrade   = onTrade;
    this.components = [];
    this._render();
    this._loadData();
  }

  _render() {
    this.container.classList.add('td-root');
    this.container.innerHTML = `
      <div class="td-topbar">
        <button class="td-back" data-act="back">← Back</button>
        <div class="td-topbar-slot" id="td-header-slot"></div>
      </div>
      <div class="td-layout">
        <div class="td-center">
          <div id="td-pulse-slot"></div>
          <div id="td-trades-slot"></div>
        </div>
        <aside class="td-right">
          <div id="td-trade-slot"></div>
          <div id="td-insights-slot"></div>
          <div id="td-chat-slot"></div>
        </aside>
      </div>
    `;

    this.container.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="back"]')) this.onBack?.();
    });

    // Mount subcomponents into their slots.
    this.components.push(
      this.header    = new Header(document.getElementById('td-header-slot'),    { mint: this.mint }),
      this.trades    = new TradesTable(document.getElementById('td-trades-slot'),{ mint: this.mint }),
      // No candles: one live number that moves with every confirmed trade.
      this.pulse     = new LivePulse(document.getElementById('td-pulse-slot'), {
        mint: this.mint,
        onTrade: (t) => this.trades.pushTrade(t),
      }),
      this.trade     = new TradePanel(document.getElementById('td-trade-slot'), { mint: this.mint, onTrade: this.onTrade }),
      this.chat      = new ChatPanel(document.getElementById('td-chat-slot'),   { mint: this.mint }),
      this.insights  = new InsightsPanel(document.getElementById('td-insights-slot'), {
        mint: this.mint,
        onData: (d) => { this.header.setInsights(d); this.trade.setLimits(d.safety); },
      }),
    );

    // Mobile: attach fixed bottom CTA + sheet. Does nothing on desktop (CSS gates it).
    this.mobileCta = new MobileCta({ tradePanel: this.trade });
    this.components.push(this.mobileCta);
  }

  // Open pages for this token, counted by the WS service.
  async _loadWatchers() {
    try {
      const base = CONFIG.wsServerUrl.replace(/^ws/, 'http');
      const res = await fetch(`${base}/watchers?mint=${this.mint}`);
      if (res.ok) this.header.setWatchers((await res.json()).watchers);
    } catch { /* ws service offline */ }
  }

  async _loadData() {
    this._loadWatchers();
    this.watchTimer = setInterval(() => this._loadWatchers(), 10_000);
    try {
      const info = await fetchTokenInfo(this.mint);
      if (!info) return;
      // Fan out to components that depend on token metadata.
      this.header.setInfo(info);
      this.trade.setInfo(info);
    } catch (err) {
      console.warn('[token-detail] fetchTokenInfo failed', err);
    }
  }

  destroy() {
    clearInterval(this.watchTimer);
    for (const c of this.components) c.destroy?.();
    this.container.classList.remove('td-root');
    this.container.innerHTML = '';
  }
}

export function mountTokenDetail(container, opts) {
  unmountTokenDetail();
  activeView = new TokenDetailView(container, opts);
  return activeView;
}

export function unmountTokenDetail() {
  if (activeView) {
    activeView.destroy();
    activeView = null;
  }
}
