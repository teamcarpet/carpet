// src/pages/pages.js
// Sidebar pages: Red Carpet, Presales, Furnace, Creators, Portfolio, Rewards,
// Favorites and "How we protect". Same visual language as the landing:
// black, white pills, Doto display type, red accent.

import { CONFIG } from '../config.js';
import { esc, safeUrl } from '../escape.js';
import { getConnection, getReadOnlyProgram, solscanAccountUrl, solscanTxUrl } from '../launchpad.js';
import { getPublicKey, isConnected } from '../wallet.js';
import { fmtSolAsUsd, getSolUsd, startSolPrice } from '../usd.js';
import { getFavorites, toggleFavorite } from '../favorites.js';
import { getTokens } from '../platform.js';
import { tokenAvatar } from '../avatar.js';

const short = (s) => (s && s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s || '');
const pct = (n) => `${(Number(n) || 0) >= 10 ? (Number(n) || 0).toFixed(0) : (Number(n) || 0).toFixed(1)}%`;
const api = async (path) => {
  const res = await fetch(`${CONFIG.apiUrl}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
};
const fmtTokens = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : (Number(n) || 0).toFixed(0));
const ago = (sec) => {
  const s = Date.now() / 1000 - Number(sec);
  if (s < 60) return `${Math.max(1, Math.floor(s))}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const avatar = (t) => tokenAvatar({ imageUrl: t?.imageUrl, mint: t?.mint, ticker: t?.ticker || t?.tk }, 'pg-av');

function hero(kicker, title, sub, stats = '') {
  return `
    <section class="pg-hero">
      <div class="pg-kicker">${kicker}</div>
      <h1 class="pg-title">${title}</h1>
      <p class="pg-sub">${sub}</p>
      ${stats ? `<div class="pg-stats">${stats}</div>` : ''}
    </section>`;
}
const stat = (label, value, tone = '') => `<div class="pg-stat"><b class="${tone}">${value}</b><span>${label}</span></div>`;
const empty = (icon, text, cta = '') => `<div class="pg-empty"><iconify-icon icon="${icon}"></iconify-icon><p>${text}</p>${cta}</div>`;
const launchCta = '<button class="pg-btn" onclick="openLaunch()">+ Launch a token</button>';
const tokenLink = (mint) => `data-open="${esc(mint)}"`;

// ── Pages ────────────────────────────────────────────────────────────────

async function redCarpet(el) {
  const { tokens } = await api('/tokens?col=all&sort=progress&limit=60');
  const live = tokens.filter(t => !t.isMigrated);
  const done = tokens.filter(t => t.isMigrated);
  const rows = live.map((t, i) => {
    const prog = Math.min(100, Number(t.prog) || 0);
    const left = Math.max(0, Number(t.targetSol) - Number(t.raisedSol));
    return `
      <button class="rc-row" ${tokenLink(t.mint)}>
        <span class="rc-rank">${String(i + 1).padStart(2, '0')}</span>
        ${avatar(t)}
        <span class="rc-name"><b>$${esc(t.ticker)}</b><small>${esc(t.name)}</small></span>
        <span class="rc-track"><span class="rc-fill" style="width:${prog}%"></span><span class="rc-step" style="left:${prog}%"></span></span>
        <span class="rc-pct">${prog >= 100 ? 'READY' : pct(prog)}</span>
        <span class="rc-left">${prog >= 100 ? 'graduating' : `${left.toFixed(2)} SOL to go`}</span>
        <span class="rc-mc">${esc(fmtSolAsUsd(Number(t.marketCap)))}</span>
      </button>`;
  }).join('');
  el.innerHTML = hero(
    'THE RUNWAY',
    'Red <em>Carpet</em>',
    'Tokens walking the curve toward permanent Meteora liquidity. The closer to 100%, the closer to graduation.',
    stat('on the curve', live.length) + stat('graduated', done.length, 'up') + stat('ready to graduate', live.filter(t => Number(t.prog) >= 100).length, 'red'),
  ) + (rows ? `<div class="pg-card rc-list">${rows}</div>` : empty('solar:rocket-2-linear', 'Nobody on the carpet yet.', launchCta));
}

async function presales(el) {
  // Decode pools one by one: devnet still has presale accounts from older
  // program versions, and a single stale layout would fail `.all()`.
  const connection = getConnection();
  const program = getReadOnlyProgram(connection);
  const raw = await connection.getProgramAccounts(program.programId, {
    filters: [{ memcmp: program.coder.accounts.memcmp('presalePool') }],
  });
  const pools = raw.flatMap(({ account }) => {
    try { return [{ account: program.coder.accounts.decode('presalePool', account.data) }]; } catch { return []; }
  });
  const byMint = new Map(getTokens().map(t => [t.mint, t]));
  const now = Date.now() / 1000;
  const items = pools.map(({ account: a }) => {
    const mint = a.mint.toBase58();
    const raised = Number(a.currentRaised) / 1e9;
    const target = Number(a.migrationTarget) / 1e9;
    const end = Number(a.endTime);
    const mode = a.presaleMode?.extreme ? 'Extreme' : 'Regular';
    const state = a.isMigrated ? 'graduated' : raised >= target ? 'filled' : end <= now ? 'ended' : 'live';
    return { mint, raised, target, end, mode, state, contributors: Number(a.numContributors), token: byMint.get(mint) };
  }).sort((x, y) => (x.state === 'live' ? 0 : 1) - (y.state === 'live' ? 0 : 1) || x.end - y.end);

  const cards = items.map(p => `
    <button class="ps-card ${p.state}" ${tokenLink(p.mint)}>
      <div class="ps-top">
        ${avatar({ ...(p.token || {}), mint: p.mint })}
        <div class="ps-name"><b>$${esc(p.token?.tk || p.mint.slice(0, 4))}</b><small>${esc(p.token?.n || 'Presale')}</small></div>
        <span class="ps-mode ${p.mode.toLowerCase()}">${p.mode}</span>
      </div>
      <div class="ps-timer" data-end="${p.end}" data-state="${p.state}"></div>
      <div class="ps-bar"><span style="width:${Math.min(100, (p.raised / (p.target || 1)) * 100)}%"></span></div>
      <div class="ps-meta"><span>${p.raised.toFixed(2)} / ${p.target.toFixed(0)} SOL</span><span>${p.contributors} in</span></div>
    </button>`).join('');

  el.innerHTML = hero(
    'FAIR ENTRY',
    'Pre<em>sales</em>',
    'Everyone gets in at the same price, capped at 1% of the target per wallet. Missed target? Full refund.',
    stat('live now', items.filter(p => p.state === 'live').length, 'up') + stat('graduated', items.filter(p => p.state === 'graduated').length) + stat('raised', fmtSolAsUsd(items.reduce((s, p) => s + p.raised, 0))),
  ) + (cards ? `<div class="ps-grid">${cards}</div>` : empty('solar:hourglass-linear', 'No presales yet.', launchCta));

  const tick = () => el.querySelectorAll('.ps-timer').forEach(t => {
    const left = Number(t.dataset.end) - Date.now() / 1000;
    if (t.dataset.state !== 'live') { t.textContent = t.dataset.state.toUpperCase(); return; }
    if (left <= 0) { t.textContent = 'ENDED'; return; }
    const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = Math.floor(left % 60);
    t.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });
  tick();
  return setInterval(tick, 1000);
}

async function furnace(el) {
  const [{ burns, totals }, stats] = await Promise.all([api('/burns?limit=50'), api('/stats')]);
  const rows = burns.map(b => `
    <div class="fu-row">
      ${avatar(b)}
      <button class="fu-name" ${tokenLink(b.mint)}><b>$${esc(b.ticker || b.mint.slice(0, 4))}</b><small>round ${b.round}/${b.totalRounds || '∞'}</small></button>
      <span class="fu-burn"><iconify-icon icon="solar:fire-bold"></iconify-icon>${fmtTokens(Number(b.tokensBurned))}</span>
      <span class="fu-sol">${esc(fmtSolAsUsd(Number(b.solSpent)))}</span>
      <a class="fu-tx" href="${esc(solscanTxUrl(b.signature))}" target="_blank" rel="noopener">${ago(b.ts)}</a>
    </div>`).join('');
  el.innerHTML = `
    <section class="pg-hero fu-hero">
      <div class="fu-glow" aria-hidden="true"></div>
      <div class="pg-kicker">EVERY SELL FEEDS THE FIRE</div>
      <h1 class="pg-title">Fur<em>nace</em></h1>
      <p class="pg-sub">24% of every sell on the curve goes to a buyback treasury. After graduation it buys the token on the market and burns it — forever.</p>
      <div class="pg-stats">
        ${stat('sell tax collected', fmtSolAsUsd(Number(totals.sellTaxCollected)), 'red')}
        ${stat('spent on buybacks', fmtSolAsUsd(Number(totals.solSpent)))}
        ${stat('tokens burned', fmtTokens(Number(stats.tokensBurned || 0)), 'red')}
        ${stat('burns in 24h', fmtSolAsUsd(Number(totals.solSpent24h)))}
      </div>
    </section>
    ${rows ? `<div class="pg-card fu-list">${rows}</div>` : empty('solar:fire-linear', 'The furnace is warming up. Burns start once tokens graduate — the treasury is already filling from sells.')}`;
}

async function creators(el) {
  const { creators: list } = await api('/leaderboard/creators?limit=50');
  const rows = list.map((c, i) => {
    const rate = c.launched ? (c.graduated / c.launched) * 100 : 0;
    const tone = rate >= 50 ? 'up' : c.graduated === 0 && c.launched >= 3 ? 'dn' : '';
    return `
      <div class="lb-row">
        <span class="lb-rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
        <a class="lb-who" href="${esc(safeUrl(solscanAccountUrl(c.creator)))}" target="_blank" rel="noopener">${esc(short(c.creator))}</a>
        <span class="lb-grad ${tone}"><b>${c.graduated}/${c.launched}</b><small>${pct(rate)} graduate</small></span>
        <button class="lb-best" ${c.bestMint ? tokenLink(c.bestMint) : ''}>$${esc(c.bestTicker || '—')}<small>ATH ${esc(fmtSolAsUsd(Number(c.bestAth)))}</small></button>
        <span class="lb-num">${c.traders}<small>traders</small></span>
        <span class="lb-num">${esc(fmtSolAsUsd(Number(c.feesSol)))}<small>earned</small></span>
      </div>`;
  }).join('');
  el.innerHTML = hero(
    'REPUTATION, NOT VOLUME',
    'Crea<em>tors</em>',
    'Ranked by how many of their tokens actually graduated. Serial launchers who never graduate show up in red.',
  ) + (rows ? `<div class="pg-card lb-table"><div class="lb-row lb-head"><span>#</span><span>Creator</span><span>Graduated</span><span>Best token</span><span>Traders</span><span>Fees</span></div>${rows}</div>` : empty('solar:cup-star-linear', 'No creators yet.', launchCta));
}

function needWallet(el, title, kicker) {
  el.innerHTML = hero(kicker, title, 'Connect a wallet to see this page.') +
    empty('solar:wallet-linear', 'Your wallet stays in your browser — CARPET only reads public chain data.', '<button class="pg-btn" onclick="walletClick(event)">Connect wallet</button>');
}

async function portfolio(el) {
  if (!isConnected()) return needWallet(el, 'Port<em>folio</em>', 'YOUR BAGS');
  const w = getPublicKey().toBase58();
  const { positions, launched } = await api(`/portfolio?wallet=${w}`);
  let invested = 0, value = 0, realized = 0;
  const rows = positions.map(p => {
    const held = Math.max(0, Number(p.tokensIn) - Number(p.tokensOut));
    const worth = held * Number(p.priceSol);
    const pnl = Number(p.solOut) + worth - Number(p.solIn);
    invested += Number(p.solIn); value += worth; realized += Number(p.solOut);
    return `
      <button class="pf-row" ${tokenLink(p.mint)}>
        ${avatar(p)}
        <span class="pf-name"><b>$${esc(p.ticker || p.mint.slice(0, 4))}</b><small>${p.isMigrated ? 'graduated' : 'on curve'}</small></span>
        <span class="pf-num">${fmtTokens(held)}<small>held</small></span>
        <span class="pf-num">${esc(fmtSolAsUsd(worth))}<small>value</small></span>
        <span class="pf-num ${pnl >= 0 ? 'up' : 'dn'}">${pnl >= 0 ? '+' : ''}${esc(fmtSolAsUsd(pnl))}<small>PnL</small></span>
      </button>`;
  }).join('');
  const total = realized + value - invested;
  el.innerHTML = hero('YOUR BAGS', 'Port<em>folio</em>', `Positions for ${esc(short(w))}, from your trades on CARPET. Value uses the latest curve price.`,
    stat('invested', fmtSolAsUsd(invested)) + stat('value now', fmtSolAsUsd(value)) + stat('total PnL', `${total >= 0 ? '+' : ''}${fmtSolAsUsd(total)}`, total >= 0 ? 'up' : 'dn') + stat('tokens launched', launched.length),
  ) + (rows ? `<div class="pg-card pf-list">${rows}</div>` : empty('solar:bag-4-linear', 'No trades yet.', '<button class="pg-btn" onclick="setView(\'carpet\')">Find a token</button>'));
}

async function rewards(el) {
  if (!isConnected()) return needWallet(el, 'Re<em>wards</em>', 'CREATOR EARNINGS');
  const w = getPublicKey().toBase58();
  const { tokens, totalSol } = await api(`/creator/rewards?wallet=${w}`);
  const rows = tokens.map(t => `
    <button class="pf-row" ${tokenLink(t.mint)}>
      <span class="pf-name"><b>$${esc(t.ticker)}</b><small>${esc(t.poolType)}${t.isMigrated ? ' · graduated' : ''}</small></span>
      <span class="pf-num">${t.trades}<small>trades</small></span>
      <span class="pf-num">${esc(fmtSolAsUsd(Number(t.fees24hSol)))}<small>24h</small></span>
      <span class="pf-num up">${esc(fmtSolAsUsd(Number(t.feesSol)))}<small>all time</small></span>
    </button>`).join('');
  el.innerHTML = hero('CREATOR EARNINGS', 'Re<em>wards</em>', 'Your creator fee lands in your wallet on every buy and sell — nothing to claim, nothing held back. Presale creators claim their token allocation from the token row.',
    stat('earned all time', fmtSolAsUsd(totalSol), 'up') + stat('tokens launched', tokens.length),
  ) + (rows ? `<div class="pg-card pf-list">${rows}</div>` : empty('solar:hand-money-linear', 'Launch a token to start earning on every trade.', launchCta));
}

async function favorites(el) {
  const favs = getFavorites();
  const byMint = new Map(getTokens().map(t => [t.mint, t]));
  const rows = favs.map(m => {
    const t = byMint.get(m) || {};
    return `
      <div class="pf-row">
        <button class="pf-name pf-open" ${tokenLink(m)}><b>$${esc(t.tk || m.slice(0, 4))}</b><small>${esc(t.n || short(m))}</small></button>
        <span class="pf-num">${esc(fmtSolAsUsd(Number(t.mc) || 0))}<small>mcap</small></span>
        <span class="pf-num">${pct(t.prog)}<small>curve</small></span>
        <button class="pf-unstar" data-unstar="${esc(m)}" title="Remove"><iconify-icon icon="solar:star-bold"></iconify-icon></button>
      </div>`;
  }).join('');
  el.innerHTML = hero('WATCHLIST', 'Favo<em>rites</em>', 'Tap ☆ on any token page to keep it here.') +
    (rows ? `<div class="pg-card pf-list">${rows}</div>` : empty('solar:star-linear', 'No favorites yet.', '<button class="pg-btn" onclick="setView(\'carpet\')">Browse the carpet</button>'));
}

function protect(el) {
  const items = [
    ['solar:lock-keyhole-bold', 'Mint is revoked', 'Supply is fixed at launch. Nobody — not the creator, not us — can print more tokens.'],
    ['solar:snowflake-bold', 'No freezing', 'Freeze authority is removed, so no one can lock your tokens in your wallet.'],
    ['solar:shield-user-bold', '1% max per wallet', 'The curve rejects buys that would push one wallet over 1% of supply.'],
    ['solar:fire-bold', '24% of sells burn', 'Sell tax funds a treasury that buys back and burns the token after graduation.'],
    ['solar:safe-square-bold', 'Liquidity locked forever', 'At graduation the LP position is locked to the program on Meteora. It can’t be pulled.'],
    ['solar:eye-scan-bold', 'Every token is checked', 'Creator history, snipers, bundles and wallets funded from the same source — shown on every token page.'],
  ];
  el.innerHTML = hero('ENFORCED BY THE CONTRACT', 'How we <em>protect</em> you', 'Not promises — rules the program enforces on every launch.') +
    `<div class="pr-grid">${items.map(([icon, t, d]) => `<div class="pg-card pr-card"><iconify-icon icon="${icon}"></iconify-icon><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>` +
    `<div class="pr-cta">${launchCta}<button class="pg-btn ghost" onclick="setView('carpet')">See the Red Carpet</button></div>`;
}

const PAGES = { carpet: redCarpet, presales, furnace, creators, portfolio, rewards, favorites, protect };
export const PAGE_KEYS = Object.keys(PAGES);

let cleanup = null;
export async function renderPage(key, el) {
  if (cleanup) { clearInterval(cleanup); cleanup = null; }
  startSolPrice();
  el.innerHTML = '<div class="pg-loading"><span></span>Loading…</div>';
  el.dataset.page = key;
  try {
    const timer = await PAGES[key](el);
    if (typeof timer === 'number') cleanup = timer;
  } catch (err) {
    console.warn('[page]', key, err);
    el.innerHTML = empty('solar:cloud-cross-linear', 'Couldn’t load this page right now. Try again in a moment.');
  }
}

// One delegated handler: any [data-open] opens that token; ☆ removes a favorite.
export function bindPages(el, openToken) {
  el.addEventListener('click', (e) => {
    const unstar = e.target.closest('[data-unstar]');
    if (unstar) { toggleFavorite(unstar.dataset.unstar); renderPage('favorites', el); return; }
    const open = e.target.closest('[data-open]');
    if (open?.dataset.open) openToken(open.dataset.open);
  });
  window.addEventListener('usd:sol-price', () => {
    if (el.dataset.page && el.offsetParent !== null && getSolUsd()) renderPage(el.dataset.page, el);
  });
}

