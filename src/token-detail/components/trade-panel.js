// src/token-detail/components/trade-panel.js
// Buy / Sell side panel.
// Logic is delegated to `onTrade` callback passed from main.js — this keeps
// the module free of wallet/launchpad dependencies.

export class TradePanel {
  constructor(host, { mint, onTrade }) {
    this.host    = host;
    this.mint    = mint;
    this.onTrade = onTrade;
    this.side    = 'buy';
    this.amount  = '';
    this.info    = null;
    this._render();
    this.host.addEventListener('click', (e) => this._onClick(e));
    this.host.addEventListener('input', (e) => this._onInput(e));
  }

  setInfo(info) {
    this.info = info;
    this._renderBalance();
  }

  _render() {
    const isBuy = this.side === 'buy';
    const ticker = this.info?.tk || '…';

    this.host.innerHTML = `
      <div class="td-card td-trade">
        <div class="td-trade-tabs">
          <button class="td-trade-tab ${isBuy  ? 'buy  on' : ''}" data-act="side" data-val="buy">Buy</button>
          <button class="td-trade-tab ${!isBuy ? 'sell on' : ''}" data-act="side" data-val="sell">Sell</button>
        </div>

        <div class="td-trade-row" id="td-trade-bal">
          <span class="td-trade-k">Balance:</span>
          <span class="td-trade-v">—</span>
        </div>

        <div class="td-trade-inputwrap">
          <input class="td-trade-input"
                 type="number" min="0" step="any"
                 placeholder="0.00"
                 value="${this.amount}"
                 data-act="amount">
          <div class="td-trade-unit">${isBuy ? 'SOL' : `$${ticker}`}</div>
        </div>

        <div class="td-trade-quick">
          <button class="td-trade-q" data-act="quick" data-val="reset">Reset</button>
          <button class="td-trade-q" data-act="quick" data-val="0.1">0.1 SOL</button>
          <button class="td-trade-q" data-act="quick" data-val="0.5">0.5 SOL</button>
          <button class="td-trade-q" data-act="quick" data-val="1">1 SOL</button>
          <button class="td-trade-q" data-act="quick" data-val="max">Max</button>
        </div>

        <button class="td-trade-submit ${isBuy ? 'buy' : 'sell'}" data-act="submit">
          ${isBuy ? 'Buy' : 'Sell'} $${ticker}
        </button>

        <div class="td-trade-info">
          ${isBuy ? 'Fee 1% · Max 1% supply' : 'Fee 1% · Tax 24% → buyback'}
        </div>
      </div>
    `;
  }

  _renderBalance() {
    // Expect main.js to expose wallet balance via the info object.
    const bal = this.info?.walletBalanceSol;
    const el = this.host.querySelector('#td-trade-bal .td-trade-v');
    if (!el) return;
    el.textContent = bal != null ? `${bal.toFixed(4)} SOL` : '—';
  }

  _onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'side') {
      this.side = t.dataset.val;
      this.amount = '';
      this._render();
    } else if (act === 'quick') {
      const v = t.dataset.val;
      if (v === 'reset') this.amount = '';
      else if (v === 'max') this.amount = String(this.info?.walletBalanceSol ?? 0);
      else this.amount = v;
      this.host.querySelector('.td-trade-input').value = this.amount;
    } else if (act === 'submit') {
      this._submit();
    }
  }

  _onInput(e) {
    if (e.target.dataset.act === 'amount') this.amount = e.target.value;
  }

  async _submit() {
    const amt = parseFloat(this.amount);
    if (!amt || amt <= 0) return;
    const btn = this.host.querySelector('[data-act="submit"]');
    btn.disabled = true;
    btn.textContent = 'Processing…';
    try {
      await this.onTrade?.({ mint: this.mint, side: this.side, amount: amt });
    } catch (err) {
      console.error('[trade] failed', err);
    } finally {
      btn.disabled = false;
      this._render();
    }
  }

  destroy() { this.host.innerHTML = ''; }
}
