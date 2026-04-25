// src/token-detail/components/market-card.js
// Large Market Cap number + ATH progress bar + 24h change.
// All values read from token info; when unavailable — "—" placeholder.

function fmtUsd(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

function fmtSigned(n) {
  if (n == null || Number.isNaN(n)) return '';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export class MarketCard {
  constructor(host, { mint }) {
    this.host = host;
    this.mint = mint;
    this.info = null;
    this._render();
  }

  setInfo(info) {
    this.info = info;
    this._render();
  }

  _render() {
    const i = this.info || {};
    const mc   = i.mc;
    const ath  = i.ath;
    const pct  = i.pct;
    const mcChange24h = i.mcChange24h;

    // Progress toward ATH: current / ath * 100, capped at 100.
    const athRatio = mc && ath ? Math.min(100, (mc / ath) * 100) : 0;
    const pctCls = pct == null ? '' : (pct >= 0 ? 'up' : 'dn');

    this.host.innerHTML = `
      <div class="td-card td-market">
        <div class="td-market-head">
          <span class="td-market-k">Market Cap</span>
        </div>
        <div class="td-market-main">
          <div class="td-market-value">${fmtUsd(mc)}</div>
          <div class="td-market-ath">
            <div class="td-market-ath-bar">
              <div class="td-market-ath-fill" style="width:${athRatio}%"></div>
            </div>
            <div class="td-market-ath-lbl">
              <span>ATH</span>
              <span>${fmtUsd(ath)}</span>
            </div>
          </div>
        </div>
        <div class="td-market-change ${pctCls}">
          ${mcChange24h != null ? fmtUsd(mcChange24h) + ' ' : ''}
          ${pct != null ? `(${fmtSigned(pct)})` : ''}
          <span class="td-market-period">24hr</span>
        </div>
      </div>
    `;
  }

  destroy() { this.host.innerHTML = ''; }
}
