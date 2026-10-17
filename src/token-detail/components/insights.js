// src/token-detail/components/insights.js
// Right-column cards built from /token/insights:
//   Safety · Creator · Holder check (top-10, snipers, bundles, linked wallets)
//   · Buyback & burn. Replaces the old bubble map with a plain verdict.

import { CONFIG } from '../../config.js';
import { esc, safeUrl } from '../../escape.js';
import { solscanAccountUrl } from '../../launchpad.js';
import { fmtSolAsUsd } from '../../usd.js';

const POLL_MS = 30_000;
const PENDING_POLL_MS = 4_000;

const short = (s) => (s && s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s || '');
const pct = (n) => `${(Number(n) || 0) >= 10 ? (Number(n) || 0).toFixed(0) : (Number(n) || 0).toFixed(1)}%`;
const fmtTokens = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : (n || 0).toFixed(0));

const FLAG_TEXT = {
  creator_sold_all: 'Creator sold everything',
  creator_sold: 'Creator has sold',
  top10_concentrated: 'Top 10 wallets hold over 40%',
  heavy_bundles: 'Over 20% bought in bundles',
  snipers_holding: 'Snipers still hold over 10%',
  linked_wallets: 'Linked wallets hold over 15%',
  twitter_reused: 'X account used by other tokens',
  authorities_live: 'Mint or freeze authority still active',
  no_max_buy: 'No per-wallet buy limit (older pool)',
};

export class InsightsPanel {
  constructor(host, { mint, onData }) {
    this.host = host;
    this.mint = mint;
    this.onData = onData;
    this.data = null;
    this.host.innerHTML = `<div class="td-card ins-loading">Checking holders and creator…</div>`;
    this._load();
  }

  async _load() {
    let next = POLL_MS;
    try {
      const res = await fetch(`${CONFIG.apiUrl}/token/insights?mint=${this.mint}`);
      if (res.ok) {
        this.data = await res.json();
        this.onData?.(this.data);
        this._render();
        if (this.data.linked?.status === 'pending') next = PENDING_POLL_MS;
      } else if (!this.data) {
        this.host.innerHTML = `<div class="td-card ins-loading">Holder checks appear once the token is indexed.</div>`;
      }
    } catch {
      if (!this.data) this.host.innerHTML = `<div class="td-card ins-loading">Holder checks are unavailable right now.</div>`;
    }
    this.timer = setTimeout(() => this._load(), next);
  }

  _render() {
    const d = this.data;
    this.host.innerHTML = [this._verdict(d), this._safety(d), this._holders(d), this._creator(d), this._buyback(d)].join('');
  }

  _verdict(d) {
    const flags = d.flags || [];
    const level = flags.length === 0 ? 'ok' : flags.length <= 2 ? 'warn' : 'bad';
    const title = level === 'ok' ? 'No red flags found' : level === 'warn' ? 'Check before buying' : 'High risk';
    const items = flags.map(f => `<li>${esc(FLAG_TEXT[f] || f)}</li>`).join('');
    return `
      <div class="td-card ins-verdict ${level}">
        <div class="ins-verdict-head">
          <iconify-icon icon="${level === 'ok' ? 'solar:shield-check-bold' : level === 'warn' ? 'solar:danger-triangle-bold' : 'solar:danger-bold'}"></iconify-icon>
          <span>${title}</span>
        </div>
        ${items ? `<ul class="ins-flags">${items}</ul>` : ''}
      </div>`;
  }

  _safety(d) {
    const s = d.safety || {};
    const row = (ok, label, value) => `
      <div class="ins-row"><span class="ins-check ${ok === true ? 'ok' : ok === false ? 'bad' : ''}">
        <iconify-icon icon="${ok === true ? 'solar:check-circle-bold' : ok === false ? 'solar:close-circle-bold' : 'solar:info-circle-linear'}"></iconify-icon></span>
        <span class="ins-k">${label}</span><span class="ins-v">${value}</span></div>`;
    const maxBuy = s.maxBuyPct == null ? '—' : s.maxBuyPct >= 100 ? 'No limit' : `${s.maxBuyPct}% per wallet`;
    return `
      <div class="td-card ins-card">
        <div class="ins-title">Safety <small>enforced by the contract</small></div>
        ${row(s.mintRevoked, 'Mint authority', s.mintRevoked ? 'Revoked' : 'Active')}
        ${row(s.freezeRevoked, 'Freeze authority', s.freezeRevoked ? 'Revoked' : 'Active')}
        ${row(s.maxBuyPct != null && s.maxBuyPct < 100, 'Max buy', maxBuy)}
        ${row(s.graduated ? true : null, 'Liquidity', s.graduated ? 'Locked forever on Meteora' : 'Locks forever at graduation')}
        ${row(null, 'Sell tax → buyback', s.sellTaxPct == null ? '—' : `${s.sellTaxPct}%`)}
      </div>`;
  }

  _holders(d) {
    const h = d.holders || {};
    const sn = d.snipers || {};
    const b = d.bundles || {};
    const l = d.linked || {};
    const tone = (v, warn) => (v > warn ? 'dn' : '');
    const top = (h.top || []).map((w, i) => `
      <a class="ins-holder" href="${esc(safeUrl(solscanAccountUrl(w.owner)))}" target="_blank" rel="noopener">
        <span class="ins-rank">#${i + 1}</span>
        <span class="ins-addr">${esc(short(w.owner))}</span>
        ${w.isCreator ? '<span class="ins-tag dev">DEV</span>' : ''}${w.isSniper ? '<span class="ins-tag snipe">SNIPER</span>' : ''}
        <span class="ins-pct">${pct(w.pct)}</span>
      </a>`).join('');
    const clusters = l.status === 'pending'
      ? '<div class="ins-note"><span class="ins-spin"></span>Tracing who funded the top wallets…</div>'
      : (l.clusters || []).length
        ? l.clusters.slice(0, 4).map(c => `
          <div class="ins-cluster ${c.viaCreator ? 'dev' : ''}">
            <div><b>${c.wallets.length} wallet${c.wallets.length === 1 ? '' : 's'}</b> ${c.viaCreator ? 'linked to the creator' : `funded by ${esc(short(c.funder))}`}</div>
            <span class="ins-pct">${pct(c.pct)}</span>
          </div>`).join('')
        : l.checked
          ? `<div class="ins-note ok">No linked wallets among the ${l.checked} largest holders</div>`
          : '<div class="ins-note">No other holders to check yet</div>';
    return `
      <div class="td-card ins-card">
        <div class="ins-title">Holder check</div>
        <div class="ins-grid">
          <div class="ins-metric"><span>Top 10</span><b class="${tone(h.top10Pct, 40)}">${pct(h.top10Pct)}</b></div>
          <div class="ins-metric"><span>Snipers</span><b class="${tone(sn.holdingPct, 10)}">${sn.wallets || 0} · ${pct(sn.holdingPct)}</b></div>
          <div class="ins-metric"><span>Bundled</span><b class="${tone(b.boughtPct, 20)}">${pct(b.boughtPct)}</b></div>
          <div class="ins-metric"><span>Linked</span><b class="${tone(l.linkedPct, 15)}">${l.status === 'pending' ? '…' : pct(l.linkedPct)}</b></div>
        </div>
        <div class="ins-sub">Linked wallets</div>
        ${clusters}
        <div class="ins-sub">Top holders <small>curve excluded</small></div>
        <div class="ins-holders">${top || '<div class="ins-note">No holders yet</div>'}</div>
      </div>`;
  }

  _creator(d) {
    const c = d.creator || {};
    const status = c.status === 'sold_all' ? ['dn', 'Sold everything'] : c.status === 'sold_some' ? ['warn', 'Has sold some'] : ['ok', 'Still holding'];
    const past = (c.pastTokens || []).slice(0, 5).map(t => `
      <a class="ins-past" href="/app/?token=${esc(t.mint)}">
        <span class="ins-past-tk">$${esc(t.ticker)}</span>
        <span class="ins-past-n">${esc(t.name)}</span>
        <span class="ins-tag ${t.isMigrated ? 'grad' : ''}">${t.isMigrated ? 'GRADUATED' : 'CURVE'}</span>
        <span class="ins-pct">ATH ${esc(fmtSolAsUsd(Number(t.ath) || 0))}</span>
      </a>`).join('');
    return `
      <div class="td-card ins-card">
        <div class="ins-title">Creator <a class="ins-link" href="${esc(safeUrl(solscanAccountUrl(c.address)))}" target="_blank" rel="noopener">${esc(short(c.address))}</a></div>
        <div class="ins-grid">
          <div class="ins-metric"><span>Graduated</span><b>${c.graduated || 0} / ${c.launched || 0}</b></div>
          <div class="ins-metric"><span>Holding</span><b class="${status[0] === 'dn' ? 'dn' : ''}">${pct(c.holdingPct)}</b></div>
          <div class="ins-metric"><span>Fees earned</span><b>${esc(fmtSolAsUsd(c.feesEarnedSol || 0))}</b></div>
          <div class="ins-metric"><span>Status</span><b class="${status[0] === 'dn' ? 'dn' : status[0] === 'ok' ? 'up' : ''}">${status[1]}</b></div>
        </div>
        ${c.twitterReusedBy > 0 ? `<div class="ins-note bad">This X account was also used by ${c.twitterReusedBy} other token${c.twitterReusedBy === 1 ? '' : 's'}</div>` : ''}
        ${past ? `<div class="ins-sub">Previous launches</div><div class="ins-pasts">${past}</div>` : '<div class="ins-note">First launch on CARPET</div>'}
      </div>`;
  }

  _buyback(d) {
    const b = d.buyback || {};
    return `
      <div class="td-card ins-card ins-burn">
        <div class="ins-title"><iconify-icon icon="solar:fire-bold"></iconify-icon> Buyback & burn</div>
        <div class="ins-grid">
          <div class="ins-metric"><span>Treasury</span><b>${esc(fmtSolAsUsd(b.treasurySol || 0))}</b></div>
          <div class="ins-metric"><span>Burned</span><b>${fmtTokens(b.burnedTokens || 0)} · ${pct(b.burnedPct)}</b></div>
        </div>
        <div class="ins-note">Every sell sends ${esc(String(d.safety?.sellTaxPct ?? 24))}% here; after graduation it buys the token back and burns it.</div>
      </div>`;
  }

  destroy() {
    clearTimeout(this.timer);
    this.host.innerHTML = '';
  }
}
