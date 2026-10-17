// src/token-detail/components/header.js
// Token header: avatar, name, ticker, contract, age, socials and the quick
// signals buyers check first — creator's share, creator's track record on
// CARPET (graduated / launched) and how many people are on this page now.

import { esc, safeUrl } from '../../escape.js';
import { isFavorite, toggleFavorite } from '../../favorites.js';
import { tokenAvatar } from '../../avatar.js';

function shorten(s, n = 4) {
  if (!s || s.length < 12) return s || '';
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

function fmtAge(ms) {
  if (!ms) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return `${Math.max(1, Math.floor(s))}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Socials come from token metadata as handles or full URLs.
function socialUrl(kind, value) {
  if (!value) return '';
  const v = String(value).trim();
  if (/^https?:\/\//i.test(v)) return safeUrl(v);
  const handle = v.replace(/^@/, '').replace(/[^\w.]/g, '');
  if (!handle) return '';
  return kind === 'x' ? `https://x.com/${handle}` : `https://t.me/${handle}`;
}

const pct = (n) => (n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2)) + '%';

export class Header {
  constructor(host, { mint }) {
    this.host = host;
    this.mint = mint;
    this.info = null;
    this.insights = null;
    this.watchers = null;
    this._render();
    host.addEventListener('click', (e) => this._onClick(e));
  }

  setInfo(info) { this.info = info; this._render(); }
  setInsights(insights) { this.insights = insights; this._render(); }
  setWatchers(n) {
    this.watchers = n;
    const el = this.host.querySelector('[data-k="watchers"] b');
    if (el) el.textContent = String(n); else this._render();
  }

  _render() {
    const i = this.info || {};
    const c = this.insights?.creator;
    const ticker = i.tk || this.mint.slice(0, 4).toUpperCase();
    const name = i.n || 'Loading…';
    const avatar = tokenAvatar({ imageUrl: i.imageUrl, mint: this.mint, ticker }, 'th-avatar');

    const socials = [
      ['x', socialUrl('x', i.twitter), 'ri:twitter-x-fill', 'X / Twitter'],
      ['tg', socialUrl('tg', i.telegram), 'ri:telegram-2-fill', 'Telegram'],
      ['web', safeUrl(i.website), 'solar:global-linear', 'Website'],
    ].filter(([, url]) => url)
      .map(([k, url, icon, label]) => `<a class="th-ico" href="${esc(url)}" target="_blank" rel="noopener nofollow" title="${label}" data-k="${k}"><iconify-icon icon="${icon}"></iconify-icon></a>`)
      .join('');

    const signals = [];
    if (c) {
      const sold = c.status !== 'holding';
      signals.push(`<span class="th-sig ${sold ? 'dn' : ''}" title="Creator holds ${pct(c.holdingPct)} of supply${sold ? ' — has sold' : ''}">
        <iconify-icon icon="mdi:chef-hat"></iconify-icon><b>${pct(c.holdingPct)}</b>${c.status === 'sold_all' ? '<em>sold</em>' : ''}</span>`);
      signals.push(`<span class="th-sig ${c.graduated > 0 ? 'up' : ''}" title="Creator's tokens on CARPET: ${c.graduated} graduated of ${c.launched} launched">
        <iconify-icon icon="solar:crown-linear"></iconify-icon><b>${c.graduated}/${c.launched}</b></span>`);
    }
    signals.push(`<span class="th-sig" data-k="watchers" title="People on this page now"><iconify-icon icon="solar:eye-linear"></iconify-icon><b>${this.watchers ?? '—'}</b></span>`);

    this.host.innerHTML = `
      <div class="th">
        ${avatar}
        <div class="th-main">
          <div class="th-row">
            <span class="th-name">${esc(name)}</span>
            <span class="th-ticker">$${esc(ticker)}</span>
            <button class="th-icon-btn" data-act="copy" title="Copy contract address"><iconify-icon icon="solar:copy-linear"></iconify-icon></button>
            <button class="th-icon-btn" data-act="share" title="Copy link"><iconify-icon icon="solar:share-linear"></iconify-icon></button>
            <button class="th-icon-btn th-fav ${isFavorite(this.mint) ? 'on' : ''}" data-act="fav" title="Favorite"><iconify-icon icon="${isFavorite(this.mint) ? 'solar:star-bold' : 'solar:star-linear'}"></iconify-icon></button>
          </div>
          <div class="th-row th-meta">
            <span class="th-age" title="Age">${esc(fmtAge(i.createdAt))}</span>
            <button class="th-ca" data-act="copy" title="Copy contract address">${esc(shorten(this.mint, 4))}</button>
            ${socials}
            ${signals.join('')}
          </div>
        </div>
      </div>
    `;
  }

  _onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'fav') { toggleFavorite(this.mint); this._render(); return; }
    const text = act === 'copy' ? this.mint : `${window.location.origin}/app/?token=${this.mint}`;
    navigator.clipboard?.writeText(text).then(() => {
      btn.classList.add('ok');
      setTimeout(() => btn.classList.remove('ok'), 1200);
    }).catch(() => {});
  }

  destroy() { this.host.innerHTML = ''; }
}
