import { esc } from '../../escape.js';
// src/token-detail/components/trade-panel.js
// Buy / Sell side panel.
// Logic is delegated to `onTrade` callback passed from main.js — this keeps
// the module free of wallet/launchpad dependencies.

export class TradePanel {
  constructor(host, { mint, onTrade, getAllowance }) {
    this.host    = host;
    this.mint    = mint;
    this.onTrade = onTrade;
    this.getAllowance = getAllowance;
    this.allowance = null;   // { maxBuySol, capReached, tokenBalance, migrating }
    this.side    = 'buy';
    this.amount  = '';
    this.info    = null;
    this._render();
    this.refreshAllowance();
    this.host.addEventListener('click', (e) => this._onClick(e));
    this.host.addEventListener('input', (e) => this._onInput(e));
  }

  setInfo(info) {
    this.info = info;
    this._render();
  }

  _render() {
    const isBuy = this.side === 'buy';
    const ticker = esc(this.info?.tk || '…');
    const isPresale = this.info?.mode === 'presale' && !this.info?.isMigrated;
    const exitLabel = this.allowance?.canRefund ? 'Refund' : 'Claim';
    const primaryLabel = isPresale
      ? (isBuy ? 'Contribute' : exitLabel)
      : (isBuy ? 'Buy' : 'Sell');

    this.host.innerHTML = `
      <div class="td-card td-trade">
        <div class="td-trade-tabs">
          <button class="td-trade-tab ${isBuy  ? 'buy  on' : ''}" data-act="side" data-val="buy">${isPresale ? 'Contribute' : 'Buy'}</button>
          <button class="td-trade-tab ${!isBuy ? 'sell on' : ''}" data-act="side" data-val="sell">${isPresale ? exitLabel : 'Sell'}</button>
        </div>

        <div class="td-trade-row" id="td-trade-bal">
          <span class="td-trade-k">Balance:</span>
          <span class="td-trade-v">${this._balanceText(isBuy)}</span>
        </div>

        <div class="td-trade-inputwrap">
          <input class="td-trade-input"
                 type="number" min="0" step="any"
                 placeholder="${isPresale && !isBuy ? 'No amount needed' : '0.00'}"
                 value="${esc(this.amount)}"
                 ${isPresale && !isBuy ? 'disabled' : ''}
                 data-act="amount">
          <div class="td-trade-unit">${isBuy ? 'SOL' : `$${ticker}`}</div>
        </div>

        <div class="td-trade-quick" style="${isPresale && !isBuy ? 'display:none;' : ''}">
          <button class="td-trade-q" data-act="quick" data-val="reset">Reset</button>
          <button class="td-trade-q" data-act="quick" data-val="0.1">0.1 SOL</button>
          <button class="td-trade-q" data-act="quick" data-val="0.5">0.5 SOL</button>
          <button class="td-trade-q" data-act="quick" data-val="1">1 SOL</button>
          <button class="td-trade-q" data-act="quick" data-val="max">Max</button>
        </div>

        <div class="td-trade-hint" id="td-trade-hint">${this._hint(isPresale, isBuy)}</div>

        <button class="td-trade-submit ${isBuy ? 'buy' : 'sell'}" data-act="submit">
          ${isPresale && !isBuy && this.allowance?.canRefund ? 'Refund my SOL' : `${primaryLabel} $${ticker}`}
        </button>

        <div class="td-trade-info">
          ${this._terms(isPresale, isBuy)}
        </div>
      </div>
    `;
  }

  _balanceText(isBuy) {
    const a = this.allowance;
    if (!a) return '—';
    if (isBuy) return a.walletBalanceSol != null ? `${a.walletBalanceSol.toFixed(4)} SOL` : '—';
    return a.tokenBalance != null ? a.tokenBalance.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
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
      else if (v === 'max') this.amount = this._maxAmount(this.side === 'buy');
      else this.amount = v;
      this.host.querySelector('.td-trade-input').value = this.amount;
    } else if (act === 'submit') {
      this._submit();
    }
  }

  // Real pool terms from /token/insights; defaults until they arrive.
  setLimits(safety) { this.safety = safety; this._render(); }

  _terms(isPresale, isBuy) {
    const s = this.safety || {};
    const fee = s.buyFeePct ?? 1;
    const tax = s.sellTaxPct ?? 24;
    const maxBuy = s.maxBuyPct == null ? 'Max 1% supply' : s.maxBuyPct >= 100 ? 'No buy limit' : `Max ${s.maxBuyPct}% supply`;
    if (isPresale) return isBuy ? `Presale fee ${fee}% · Max 1% of target` : 'Available after migration';
    return isBuy ? `Fee ${fee}% · ${maxBuy}` : `Fee ${fee}% · Tax ${tax}% → buyback`;
  }

  _onInput(e) {
    if (e.target.dataset.act === 'amount') {
      this.amount = e.target.value;
      const isPresale = this.info?.mode === 'presale' && !this.info?.isMigrated;
      const h = this.host.querySelector('#td-trade-hint');
      if (h) h.innerHTML = this._hint(isPresale, this.side === 'buy');
    }
  }

  // Wallet-specific limits from the chain (1% cap left, token balance).
  async refreshAllowance() {
    if (!this.getAllowance) return;
    try {
      this.allowance = await this.getAllowance();
    } catch { this.allowance = null; }
    this._render();
  }

  _presaleHint(a, isBuy) {
    if (isBuy) {
      if (a.migrated) return 'This presale has graduated.';
      if (a.ended) return a.filled ? 'Presale filled — waiting to graduate.' : '<span class="warn">Presale ended without reaching its target.</span>';
      if (a.maxBuySol <= 0) return '<span class="warn">You’ve reached the 1% per-wallet limit for this presale.</span>';
      const amt = parseFloat(this.amount);
      const max = a.maxBuySol.toFixed(a.maxBuySol < 1 ? 3 : 2);
      if (amt > a.maxBuySol * 1.0005) return `<span class="warn">Over the limit — max ${max} SOL</span>`;
      return `You can contribute up to ${max} SOL${a.contributed ? ` · in: ${a.contributed.toFixed(3)} SOL` : ''}`;
    }
    if (a.canRefund) return `Target missed — refund ${a.contributed.toFixed(3)} SOL (1% entry fee isn’t refunded)`;
    if (a.canClaim) return 'Your tokens are ready to claim.';
    if (a.claimed) return 'You’ve claimed your tokens.';
    if (a.refunded) return 'You’ve been refunded.';
    if (!a.contributed) return 'You didn’t join this presale.';
    return a.ended ? 'Presale filled — claim opens when it graduates.' : 'Claim opens when the presale graduates; refund if it misses its target.';
  }

  _maxAmount(isBuy) {
    const a = this.allowance;
    if (a?.presale) return isBuy && a.maxBuySol > 0 ? String(Math.floor(Math.min(a.maxBuySol, (this.allowance?.walletBalanceSol ?? Infinity) - 0.01) * 1e4) / 1e4) : '';
    if (a?.migrated && isBuy) { const b = (this.allowance?.walletBalanceSol ?? 0) - 0.01; return b > 0 ? String(Math.floor(b * 1e4) / 1e4) : ''; }
    if (!isBuy) return a ? String(a.tokenBalance) : '';
    const bal = Math.max(0, (this.allowance?.walletBalanceSol ?? Infinity) - 0.01); // keep SOL for fees
    const cap = a ? a.maxBuySol : bal;
    const v = Math.min(cap, bal);
    return Number.isFinite(v) && v > 0 ? String(Math.floor(v * 1e4) / 1e4) : '';
  }

  _hint(isPresale, isBuy) {
    const a = this.allowance;
    if (!a) return '';
    if (a.presale) return this._presaleHint(a, isBuy);
    if (a.migrated) return isBuy ? 'Trades on Meteora — no wallet limit after graduation' : (a.tokenBalance ? `You hold ${a.tokenBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '');
    if (a.migrating) return '<span class="warn">Target reached — moving to Meteora. Trading reopens there shortly.</span>';
    if (!isBuy) return a.tokenBalance ? `You hold ${a.tokenBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '';
    if (a.capReached) return '<span class="warn">You’ve reached the 1% per-wallet limit on this token.</span>';
    const amt = parseFloat(this.amount);
    const max = a.maxBuySol.toFixed(a.maxBuySol < 1 ? 3 : 2);
    if (amt > a.maxBuySol * 1.0005) return `<span class="warn">Over the 1% wallet limit — max ${max} SOL right now</span>`;
    return `You can buy up to ${max} SOL (1% wallet limit)`;
  }

  async _submit() {
    const amt = parseFloat(this.amount);
    const isClaim = this.info?.mode === 'presale' && !this.info?.isMigrated && this.side === 'sell';
    if (!isClaim && (!amt || amt <= 0)) return;
    const a = this.allowance;
    if (!isClaim && this.side === 'buy' && a && !a.migrated) {
      if (a.migrating || a.capReached || (a.presale ? a.ended || amt > a.maxBuySol * 1.0005 : amt > a.maxBuySol * 1.0005)) {
        const h = this.host.querySelector('#td-trade-hint');
        if (h) h.innerHTML = this._hint(false, true);
        return;
      }
    }
    const btn = this.host.querySelector('[data-act="submit"]');
    btn.disabled = true;
    btn.textContent = 'Processing…';
    try {
      const exit = this.allowance?.canRefund ? 'refundPresale' : 'claimPresale';
      await this.onTrade?.({ mint: this.mint, side: isClaim ? exit : this.side, amount: amt, migrated: !!this.allowance?.migrated });
    } catch (err) {
      console.error('[trade] failed', err);
    } finally {
      btn.disabled = false;
      this.amount = '';
      this._render();
      this.refreshAllowance();
    }
  }

  destroy() { this.host.innerHTML = ''; }
}
