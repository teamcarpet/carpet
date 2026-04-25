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
import { MarketCard }      from './components/market-card.js';
import { ChartToolbar }    from './components/chart-toolbar.js';
import { ChartEmbed }      from './components/chart-embed.js';
import { TradesTable }     from './components/trades-table.js';
import { TradePanel }      from './components/trade-panel.js';
import { BondingProgress } from './components/bonding-progress.js';
import { TopHolders }      from './components/top-holders.js';
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
          <div id="td-market-slot"></div>
          <div id="td-toolbar-slot"></div>
          <div id="td-chart-slot"></div>
          <div id="td-trades-slot"></div>
        </div>
        <aside class="td-right">
          <div id="td-trade-slot"></div>
          <div id="td-bonding-slot"></div>
          <div id="td-chat-slot"></div>
          <div id="td-holders-slot"></div>
        </aside>
      </div>
    `;

    this.container.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="back"]')) this.onBack?.();
    });

    // Mount subcomponents into their slots.
    this.components.push(
      this.header    = new Header(document.getElementById('td-header-slot'),    { mint: this.mint }),
      this.market    = new MarketCard(document.getElementById('td-market-slot'),{ mint: this.mint }),
      this.toolbar   = new ChartToolbar(document.getElementById('td-toolbar-slot')),
      this.chart     = new ChartEmbed(document.getElementById('td-chart-slot'), { mint: this.mint }),
      this.trades    = new TradesTable(document.getElementById('td-trades-slot'),{ mint: this.mint }),
      this.trade     = new TradePanel(document.getElementById('td-trade-slot'), { mint: this.mint, onTrade: this.onTrade }),
      this.bonding   = new BondingProgress(document.getElementById('td-bonding-slot'),{ mint: this.mint }),
      this.chat      = new ChatPanel(document.getElementById('td-chat-slot'),   { mint: this.mint }),
      this.holders   = new TopHolders(document.getElementById('td-holders-slot'),{ mint: this.mint }),
    );

    // Wire toolbar → chart: changing resolution/mode pushes into chart.
    this.toolbar.on('resolutionChange', (res) => this.chart.setResolution(res));
    this.toolbar.on('priceModeChange',  (mode) => this.chart.setPriceMode(mode));

    // Mobile: attach fixed bottom CTA + sheet. Does nothing on desktop (CSS gates it).
    this.mobileCta = new MobileCta({ tradePanel: this.trade });
    this.components.push(this.mobileCta);
  }

  async _loadData() {
    try {
      const info = await fetchTokenInfo(this.mint);
      if (!info) return;
      // Fan out to components that depend on token metadata.
      this.header.setInfo(info);
      this.market.setInfo(info);
      this.bonding.setInfo(info);
      this.trade.setInfo(info);
    } catch (err) {
      console.warn('[token-detail] fetchTokenInfo failed', err);
    }
  }

  destroy() {
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
