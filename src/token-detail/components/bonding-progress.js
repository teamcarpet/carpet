// src/token-detail/components/bonding-progress.js
// Progress bar showing % toward migration (100 SOL target).
// After migration it shows "Graduated" state.

export class BondingProgress {
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
    const i    = this.info || {};
    const prog = Math.max(0, Math.min(100, Number(i.prog) || 0));
    const migrated = !!i.isMigrated;

    if (migrated) {
      this.host.innerHTML = `
        <div class="td-card td-bonding graduated">
          <div class="td-bonding-head">
            <span class="td-bonding-title">Graduated</span>
            <span class="td-bonding-pct">100%</span>
          </div>
          <div class="td-bonding-bar">
            <div class="td-bonding-fill" style="width:100%"></div>
          </div>
          <div class="td-bonding-sub">Migrated to Meteora · Buyback active</div>
        </div>
      `;
      return;
    }

    this.host.innerHTML = `
      <div class="td-card td-bonding">
        <div class="td-bonding-head">
          <span class="td-bonding-title">Bonding curve progress</span>
          <span class="td-bonding-pct">${prog.toFixed(1)}%</span>
        </div>
        <div class="td-bonding-bar">
          <div class="td-bonding-fill" style="width:${prog}%"></div>
        </div>
        <div class="td-bonding-sub">${prog.toFixed(1)} / 100 SOL raised</div>
      </div>
    `;
  }

  destroy() { this.host.innerHTML = ''; }
}
