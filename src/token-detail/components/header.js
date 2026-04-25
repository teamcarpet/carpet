// src/token-detail/components/header.js
// Top bar: avatar + ticker + name + author + age + share/address/favourite controls.

function shorten(s, n = 4) {
  if (!s || s.length < 12) return s || '';
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

function fmtAge(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export class Header {
  constructor(host, { mint }) {
    this.host = host;
    this.mint = mint;
    this.info = null;
    this._render();
    host.addEventListener('click', (e) => this._onClick(e));
  }

  setInfo(info) {
    this.info = info;
    this._render();
  }

  _render() {
    const i = this.info || {};
    const ticker   = i.tk ? `$${i.tk}` : shorten(this.mint, 6);
    const name     = i.n  || 'Loading…';
    const author   = i.creator ? shorten(i.creator, 4) : '';
    const age      = fmtAge(i.createdAt);
    const img      = i.imageUrl
      ? `<img class="td-hdr-img" src="${i.imageUrl}" alt="">`
      : `<div class="td-hdr-img td-hdr-emoji">${i.em || '🎯'}</div>`;

    this.host.innerHTML = `
      <div class="td-hdr">
        ${img}
        <div class="td-hdr-titles">
          <div class="td-hdr-row">
            <span class="td-hdr-ticker">${ticker}</span>
            <span class="td-hdr-name">${name}</span>
          </div>
          <div class="td-hdr-meta">
            ${author ? `<span>by ${author}</span>` : ''}
            ${age    ? `<span>·</span><span>${age}</span>` : ''}
          </div>
        </div>
        <div class="td-hdr-actions">
          <button class="td-hdr-btn" data-act="share"    title="Share">↗</button>
          <button class="td-hdr-btn" data-act="copy"     title="Copy mint address">${shorten(this.mint, 4)}</button>
          <button class="td-hdr-btn" data-act="favourite" title="Favourite">☆</button>
        </div>
      </div>
    `;
  }

  _onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'copy') {
      navigator.clipboard.writeText(this.mint).catch(() => {});
      this.host.querySelector('[data-act="copy"]').textContent = 'Copied ✓';
      setTimeout(() => this._render(), 1200);
    } else if (act === 'share') {
      const url = `${window.location.origin}${window.location.pathname}?token=${this.mint}`;
      navigator.clipboard.writeText(url).catch(() => {});
    } else if (act === 'favourite') {
      const btn = this.host.querySelector('[data-act="favourite"]');
      btn.textContent = btn.textContent === '☆' ? '★' : '☆';
    }
  }

  destroy() { this.host.innerHTML = ''; }
}
