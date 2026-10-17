// ── src/profile.js ──────────────────────────────────────────────────────────
// Profile page: identity (avatar, banner, name, bio — kept in localStorage),
// wallet stats and Holdings / Created / Activity / Rewards tabs.

import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { CONFIG } from './config.js';
import { getPublicKey, getBalance, isConnected, onWalletChange } from './wallet.js';
import { getTokens } from './platform.js';
import { getConnection, solscanAccountUrl, solscanTxUrl } from './launchpad.js';
import { fmtSolAsUsd, startSolPrice } from './usd.js';
import { tokenAvatar } from './avatar.js';

const STORAGE_KEY = 'carpet_profile_';
const MAX_IMAGE_MB = 2;
const DEFAULT_EMOJI = '🎭';

// ── Storage ──────────────────────────────────────────────────────────────────
function defaults(pk) {
  return {
    username: pk ? pk.slice(0, 4) + '_' + pk.slice(-4) : 'anon',
    bio: '',
    avatar: null,          // data URL or null
    avatarEmoji: DEFAULT_EMOJI,
    banner: null,          // data URL or null
  };
}

function loadProfile(pk) {
  if (!pk) return defaults('');
  try {
    const raw = localStorage.getItem(STORAGE_KEY + pk);
    if (raw) return { ...defaults(pk), ...JSON.parse(raw) };
  } catch {}
  return defaults(pk);
}

function saveProfileData(pk, data) {
  if (!pk) return false;
  try {
    localStorage.setItem(STORAGE_KEY + pk, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Profile save failed:', e);
    window.showN?.('Storage full — use smaller images');
    return false;
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ── Render the profile view ──────────────────────────────────────────────────
// Same language as the sidebar pages: Doto name, USD-first stats, pill tabs.
// Holdings come from the wallet's token accounts (RPC); trades, launches and
// creator fees from the indexer.

const api = async (path) => {
  const res = await fetch(`${CONFIG.apiUrl}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
};
const short = (s) => (s && s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s || '');
const fmtTokens = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : (Number(n) || 0).toFixed(n < 1 ? 4 : 0));
const ago = (sec) => {
  const s = Date.now() / 1000 - Number(sec);
  if (s < 60) return `${Math.max(1, Math.floor(s))}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const ico = (n) => `<iconify-icon icon="solar:${n}"></iconify-icon>`;
const av = (t) => tokenAvatar({ imageUrl: t?.imageUrl, mint: t?.mint, ticker: t?.ticker }, 'pg-av');
const stat = (label, value, tone = '') => `<div class="pg-stat"><b class="${tone}">${value}</b><span>${label}</span></div>`;
const empty = (icon, text, cta = '') => `<div class="pg-empty">${ico(icon)}<p>${text}</p>${cta}</div>`;

const TABS = [['holdings', 'Holdings'], ['created', 'Created'], ['activity', 'Activity'], ['rewards', 'Rewards']];
let data = null;      // { wallet, positions, launched, rewards, holdings }
let currentTab = 'holdings';

async function loadHoldings(wallet) {
  const conn = getConnection();
  const { value } = await conn.getParsedTokenAccountsByOwner(new PublicKey(wallet), { programId: TOKEN_PROGRAM_ID });
  return value
    .map(({ account }) => account.data.parsed.info)
    .map((i) => ({ mint: i.mint, amount: Number(i.tokenAmount.uiAmount) || 0 }))
    .filter((h) => h.amount > 0);
}

export async function renderProfile() {
  const container = document.getElementById('profile-view');
  if (!container) return;
  container.classList.add('pg', 'pv');

  if (!isConnected()) {
    container.innerHTML = `
      <section class="pg-hero">
        <div class="pg-kicker">PROFILE</div>
        <h1 class="pg-title">Your <em>profile</em></h1>
        <p class="pg-sub">Connect a wallet to see your holdings, launches, trades and creator earnings.</p>
      </section>
      <button class="pg-btn" onclick="walletClick(event)">${ico('wallet-linear')} Connect wallet</button>`;
    return;
  }

  const pk = getPublicKey().toBase58();
  const p = loadProfile(pk);
  startSolPrice();

  const bannerStyle = p.banner ? `background-image:url('${p.banner}')` : '';
  const avatarInner = p.avatar
    ? `<img src="${p.avatar}" alt="">`
    : `<span>${p.avatarEmoji || DEFAULT_EMOJI}</span>`;

  container.innerHTML = `
    <div class="pv-banner${p.banner ? ' has-img' : ''}" style="${bannerStyle}"></div>
    <div class="pv-head">
      <div class="pv-av">${avatarInner}</div>
      <div class="pv-actions">
        <a class="pg-btn ghost sm" href="${solscanAccountUrl(pk)}" target="_blank" rel="noopener">${ico('square-arrow-right-up-linear')} Solscan</a>
        <button class="pg-btn sm" onclick="_app.openEditProfile()">${ico('pen-linear')} Edit profile</button>
      </div>
    </div>
    <div class="pv-id">
      <div class="pg-kicker">PROFILE</div>
      <h1 class="pv-name">${escapeHTML(p.username)}</h1>
      <button class="pv-addr" onclick="_app.copyAddrUI()" title="Copy address">${short(pk)} ${ico('copy-linear')}</button>
      ${p.bio ? `<p class="pv-bio">${escapeHTML(p.bio)}</p>` : `<button class="pv-bio-empty" onclick="_app.openEditProfile()">+ Add a bio</button>`}
    </div>
    <div class="pg-stats pv-stats" id="pv-stats">${stat('SOL balance', fmtSolAsUsd(getBalance() || 0))}${stat('holdings', '—')}${stat('total PnL', '—')}${stat('tokens launched', '—')}${stat('creator earnings', '—')}</div>
    <div class="pv-tabs" role="tablist">${TABS.map(([k, l]) => `<button class="pv-tab${k === currentTab ? ' on' : ''}" data-tab="${k}" role="tab">${l}</button>`).join('')}</div>
    <div id="pf-content"><div class="pg-loading"><span></span>Loading…</div></div>`;

  container.querySelector('.pv-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) renderProfileTab(b.dataset.tab);
  });
  container.querySelector('#pf-content').addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o) window._app?.openToken?.(o.dataset.open);
  });

  const [port, rew, hold] = await Promise.allSettled([
    api(`/portfolio?wallet=${pk}`),
    api(`/creator/rewards?wallet=${pk}`),
    loadHoldings(pk),
  ]);
  if (getPublicKey()?.toBase58() !== pk) return; // wallet switched meanwhile
  data = {
    wallet: pk,
    positions: port.value?.positions || [],
    launched: port.value?.launched || [],
    rewards: rew.value || { tokens: [], totalSol: 0 },
    holdings: hold.value || null,
    activity: null,
  };
  renderStats();
  renderProfileTab(currentTab);
}

function priceOf(mint) {
  return Number(data.positions.find((x) => x.mint === mint)?.priceSol) || 0;
}
function tokenMeta(mint) {
  const pos = data.positions.find((x) => x.mint === mint);
  const t = getTokens().find((x) => x.mint === mint) || {};
  return { mint, ticker: pos?.ticker || t.ticker || t.tk || short(mint), name: pos?.name || t.name || '', imageUrl: pos?.imageUrl || t.imageUrl, isMigrated: pos?.isMigrated ?? t.isMigrated };
}

function renderStats() {
  let invested = 0, realized = 0, value = 0;
  data.positions.forEach((p) => {
    invested += Number(p.solIn); realized += Number(p.solOut);
    const held = Math.max(0, Number(p.tokensIn) - Number(p.tokensOut));
    value += held * Number(p.priceSol);
  });
  const holdValue = data.holdings ? data.holdings.reduce((s, h) => s + h.amount * priceOf(h.mint), 0) : value;
  const pnl = realized + value - invested;
  const el = document.getElementById('pv-stats');
  if (!el) return;
  el.innerHTML =
    stat('SOL balance', fmtSolAsUsd(getBalance() || 0)) +
    stat('holdings', fmtSolAsUsd(holdValue)) +
    stat('total PnL', `${pnl >= 0 ? '+' : ''}${fmtSolAsUsd(pnl)}`, data.positions.length ? (pnl >= 0 ? 'up' : 'dn') : '') +
    stat('tokens launched', data.launched.length) +
    stat('creator earnings', fmtSolAsUsd(Number(data.rewards.totalSol) || 0), Number(data.rewards.totalSol) > 0 ? 'up' : '');
}

export async function renderProfileTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.pv-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const c = document.getElementById('pf-content');
  if (!c || !data) return;
  const launchCta = '<button class="pg-btn" onclick="openLaunch()">+ Launch a token</button>';

  if (tab === 'holdings') {
    const list = data.holdings
      ? data.holdings.map((h) => ({ ...tokenMeta(h.mint), held: h.amount }))
      : data.positions.map((p) => ({ ...tokenMeta(p.mint), held: Math.max(0, Number(p.tokensIn) - Number(p.tokensOut)) })).filter((x) => x.held > 0);
    const rows = list
      .map((t) => ({ ...t, worth: t.held * priceOf(t.mint) }))
      .sort((a, b) => b.worth - a.worth)
      .map((t) => `
        <button class="pv-row" data-open="${escapeHTML(t.mint)}">
          ${av(t)}
          <span class="pf-name"><b>$${escapeHTML(t.ticker)}</b><small>${t.name ? escapeHTML(t.name) : short(t.mint)}</small></span>
          <span class="pf-num">${fmtTokens(t.held)}<small>tokens</small></span>
          <span class="pf-num">${t.worth ? escapeHTML(fmtSolAsUsd(t.worth)) : '—'}<small>value</small></span>
        </button>`).join('');
    c.innerHTML = rows
      ? `<div class="pg-card pv-list">${rows}</div>${data.holdings ? '' : '<p class="pv-note">Wallet balances unavailable right now — showing positions from your CARPET trades.</p>'}`
      : empty('solar:bag-4-linear', 'No tokens in this wallet yet.', '<button class="pg-btn" onclick="setView(\'carpet\')">Find a token</button>');
  } else if (tab === 'created') {
    const rows = data.launched.map((t) => `
      <button class="pv-card" data-open="${escapeHTML(t.mint)}">
        ${av(t)}
        <span class="pf-name"><b>$${escapeHTML(t.ticker)}</b><small>${escapeHTML(t.name || '')}</small></span>
        <span class="pv-badge ${t.isMigrated ? 'grad' : ''}">${t.isMigrated ? 'Graduated' : 'On curve'}</span>
      </button>`).join('');
    c.innerHTML = rows ? `<div class="pv-grid">${rows}</div>` : empty('solar:rocket-2-linear', 'You haven’t launched a token yet.', launchCta);
  } else if (tab === 'activity') {
    if (!data.activity) {
      c.innerHTML = '<div class="pg-loading"><span></span>Loading…</div>';
      try { data.activity = (await api(`/activity?wallet=${data.wallet}`)).trades; } catch { data.activity = false; }
      if (currentTab !== 'activity') return;
    }
    if (data.activity === false) {
      data.activity = null; // retry next time the tab opens
      c.innerHTML = empty('solar:cloud-cross-linear', 'Activity is unavailable right now. Try again in a moment.');
      return;
    }
    const rows = data.activity.map((t) => `
      <div class="pv-row act">
        <span class="pv-side ${t.side}">${t.side === 'buy' ? 'Buy' : 'Sell'}</span>
        <button class="pf-name pv-link" data-open="${escapeHTML(t.mint)}"><b>$${escapeHTML(t.ticker || short(t.mint))}</b><small>${fmtTokens(Number(t.amountToken))} tokens</small></button>
        <span class="pf-num">${escapeHTML(fmtSolAsUsd(Number(t.amountSol)))}<small>${Number(t.amountSol).toFixed(3)} SOL</small></span>
        <a class="pv-tx" href="${solscanTxUrl(t.signature)}" target="_blank" rel="noopener">${ago(t.ts)} ${ico('arrow-right-up-linear')}</a>
      </div>`).join('');
    c.innerHTML = rows ? `<div class="pg-card pv-list">${rows}</div>` : empty('solar:history-linear', 'No trades on CARPET yet.');
  } else if (tab === 'rewards') {
    const rows = (data.rewards.tokens || []).map((t) => `
      <button class="pv-row" data-open="${escapeHTML(t.mint)}">
        ${av(t)}
        <span class="pf-name"><b>$${escapeHTML(t.ticker)}</b><small>${escapeHTML(t.poolType || '')}${t.isMigrated ? ' · graduated' : ''}</small></span>
        <span class="pf-num">${t.trades}<small>trades</small></span>
        <span class="pf-num">${escapeHTML(fmtSolAsUsd(Number(t.fees24hSol)))}<small>24h</small></span>
        <span class="pf-num up">${escapeHTML(fmtSolAsUsd(Number(t.feesSol)))}<small>all time</small></span>
      </button>`).join('');
    c.innerHTML = rows
      ? `<div class="pg-card pv-list">${rows}</div><p class="pv-note">Creator fees are paid to your wallet on every trade — there’s nothing to claim.</p>`
      : empty('solar:hand-money-linear', 'Launch a token to earn 0.5% of every trade.', launchCta);
  }
}

// ── Edit modal ───────────────────────────────────────────────────────────────
export function openEditProfile() {
  if (!isConnected()) { window.showN?.('Connect wallet first'); return; }
  const pk = getPublicKey().toBase58();
  const p = loadProfile(pk);

  document.getElementById('epf-username').value = p.username || '';
  document.getElementById('epf-bio').value = p.bio || '';
  document.getElementById('epf-avatar-file').value = '';
  document.getElementById('epf-banner-file').value = '';

  const avEl = document.getElementById('epf-avatar-preview');
  avEl.innerHTML = p.avatar
    ? `<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover;">`
    : `<span style="font-size:40px;">${p.avatarEmoji || DEFAULT_EMOJI}</span>`;

  const bnEl = document.getElementById('epf-banner-preview');
  bnEl.style.background = p.banner
    ? `url('${p.banner}') center/cover,var(--bg-3)`
    : 'radial-gradient(ellipse at 30% 50%,rgba(255,45,45,.25),transparent 60%),var(--bg-3)';

  // Staging for pending uploads
  window._epfTemp = {
    avatar: p.avatar,
    banner: p.banner,
    avatarEmoji: p.avatarEmoji || DEFAULT_EMOJI,
  };

  document.getElementById('epf-modal').classList.add('open');
}

export function closeEditProfile() {
  document.getElementById('epf-modal').classList.remove('open');
  window._epfTemp = null;
}

export async function uploadProfileAvatar(input) {
  const f = input.files?.[0];
  if (!f) return;
  if (f.size > MAX_IMAGE_MB * 1024 * 1024) {
    window.showN?.(`Image too large — max ${MAX_IMAGE_MB}MB`);
    input.value = '';
    return;
  }
  try {
    const dataUrl = await fileToDataURL(f);
    window._epfTemp.avatar = dataUrl;
    document.getElementById('epf-avatar-preview').innerHTML =
      `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
  } catch (e) {
    window.showN?.('Failed to read image');
  }
}

export async function uploadProfileBanner(input) {
  const f = input.files?.[0];
  if (!f) return;
  if (f.size > MAX_IMAGE_MB * 1024 * 1024) {
    window.showN?.(`Image too large — max ${MAX_IMAGE_MB}MB`);
    input.value = '';
    return;
  }
  try {
    const dataUrl = await fileToDataURL(f);
    window._epfTemp.banner = dataUrl;
    document.getElementById('epf-banner-preview').style.background =
      `url('${dataUrl}') center/cover,var(--bg-3)`;
  } catch (e) {
    window.showN?.('Failed to read image');
  }
}

export function saveProfile() {
  if (!isConnected()) return;
  const pk = getPublicKey().toBase58();

  const username = (document.getElementById('epf-username').value || '').trim();
  const bio = (document.getElementById('epf-bio').value || '').trim();

  const data = {
    username: (username || 'anon').slice(0, 24),
    bio: bio.slice(0, 280),
    avatar: window._epfTemp?.avatar || null,
    avatarEmoji: window._epfTemp?.avatarEmoji || DEFAULT_EMOJI,
    banner: window._epfTemp?.banner || null,
  };

  if (saveProfileData(pk, data)) {
    window.showN?.('✓ Profile saved');
    closeEditProfile();
    renderProfile();
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
export function initProfile() {
  onWalletChange(() => {
    const v = document.getElementById('profile-view');
    if (v && getComputedStyle(v).display !== 'none') renderProfile();
  });
}
