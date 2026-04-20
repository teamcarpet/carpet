import {
  connectWallet, disconnectWallet, isConnected,
  getPublicKey, getBalance, getShortAddress,
  copyAddress, refreshBalance, onWalletChange,
} from './wallet.js';
import {
  getQuote, executeSwap, searchTokens, getTokenInfo,
  formatAmount, toRawAmount,
} from './jupiter.js';
import { uploadFileToPinata, uploadTokenMetadata } from './ipfs.js';
import {
  getTokens, getToken, addToken, updateToken, deleteToken,
  getTickerTokens, getLives, addLive, getActiveLives,
  getRewards, addReward,
} from './platform.js';
import { startLive, stopLive, joinLive, sendChatMessage, onChatMessage } from './live.js';
import { CONFIG } from './config.js';
import {
     renderProfile, openEditProfile, closeEditProfile,
     uploadProfileAvatar, uploadProfileBanner,
     saveProfile as saveProfileFn, shareProfile,
     initProfile,
   } from './profile.js';

// ── Globals ──────────────────────────────────────────────────────────────────
let curTk = null, tmode = 'buy';
let sbOpen = false;
let ci = 0; const CV = 3;
const colSort = { new: 'date', bonding: 'prog', migrated: 'date' };
let searchQ = '';
let bvActive = null, bvFilter = '';
let activeRoom = null;
let currentLiveId = null;
let swapTokenIn = null, swapTokenOut = null;
let swapQuote = null;
let imageFileGlobal = null;
let bannerFileGlobal = null;
let selM = null, fData = {};

// ── Formatters ───────────────────────────────────────────────────────────────
function fm(n) { if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'; return '$' + n; }
function fh(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n); }
function fAge(ts) { const s = (Date.now() - ts) / 1000; if (s < 60) return Math.floor(s) + 's'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; }

// ── Notification bar ─────────────────────────────────────────────────────────
export function showN(msg) {
  const b = document.getElementById('nbar');
  b.textContent = msg; b.style.display = 'block';
  clearTimeout(b._t); b._t = setTimeout(() => b.style.display = 'none', 3800);
}

// ── Wallet UI ────────────────────────────────────────────────────────────────
onWalletChange(() => updateWalletUI());

export async function walletClick(e) {
  e.stopPropagation();
  if (!isConnected()) {
    const btn = document.getElementById('cbtn');
    btn.disabled = true; btn.textContent = 'Connecting...';
    try {
      await connectWallet();
    } catch (err) {
      showN(err.message || 'Connection failed');
    } finally {
      btn.disabled = false;
    }
    return;
  }
  toggleWMenu();
}

function updateWalletUI() {
  const btn = document.getElementById('cbtn');
  const menu = document.getElementById('wmenu');
  if (isConnected()) {
    const addr = getShortAddress();
    const bal = getBalance().toFixed(3);
    btn.innerHTML = `<iconify-icon icon="solar:check-circle-bold" style="font-size:13px;"></iconify-icon> ${addr}`;
    btn.classList.add('ok');
    menu.querySelector('.wm-addr').innerHTML = `${addr}<span class="wm-bal">${bal} SOL</span>`;
    document.getElementById('hdr-sol').textContent = bal + ' SOL';
  } else {
    btn.innerHTML = `<iconify-icon icon="solar:wallet-bold" style="font-size:13px;"></iconify-icon> Connect`;
    btn.classList.remove('ok');
    document.getElementById('hdr-sol').textContent = '';
  }
  if (curTk && document.getElementById('tdm').classList.contains('open')) rdeta(curTk);
  refreshTicker();
}

export function disconnectWalletUI() { disconnectWallet().then(() => { closeWMenu(); showN('Wallet disconnected'); }); }
export function toggleWMenu() { document.getElementById('wmenu').classList.toggle('open'); }
export function closeWMenu() { document.getElementById('wmenu').classList.remove('open'); }
export async function copyAddrUI() { await copyAddress(); showN('Address copied'); closeWMenu(); }
export function openSolscan() {
  const pk = getPublicKey();
  if (pk) window.open(`https://solscan.io/account/${pk.toBase58()}`, '_blank');
  closeWMenu();
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
export function toggleSb() {
  sbOpen = !sbOpen;
  document.getElementById('sb').classList.toggle('open', sbOpen);
  document.body.classList.toggle('sb-open', sbOpen);
  setTimeout(updCrs, 300);
}

// ── Views ────────────────────────────────────────────────────────────────────
export function setView(v) {
  ['home', 'bubble', 'rewards', 'live', 'profile'].forEach(id => {
    const el = document.getElementById(id + '-view');
    if (el) el.style.display = id === v ? 'flex' : 'none';
    const sbi = document.getElementById('si-' + id);
    if (sbi) sbi.classList.toggle('on', id === v);
  });
  if (v === 'live') buildLive();
  if (v === 'home') setTimeout(updCrs, 60);
  if (v === 'bubble') setTimeout(renderBvMap, 50);
  if (v === 'rewards') renderRewards();
  if (v === 'profile') renderProfile();
}
export function goProfile() { setView('profile'); closeWMenu(); }

// ── Ticker ───────────────────────────────────────────────────────────────────
export function refreshTicker() {
  const tokens = getTickerTokens();
  if (!tokens.length) return;
  const inner = document.querySelector('.ticker-inner');
  if (!inner) return;
  const sep = '<span class="ti-sep">◊</span>';
  const doubled = [...tokens, ...tokens].map(t =>
    `<div class="ti"><span class="ti-n">$${t.ticker}</span> <span class="${t.pct >= 0 ? 'up-c' : 'dn-c'}">${t.pct >= 0 ? '+' : ''}${(t.pct || 0).toFixed(1)}%</span></div>`
  ).join(sep);
  inner.innerHTML = doubled;
}

window.addEventListener('platform:token-added', refreshTicker);
window.addEventListener('platform:token-updated', refreshTicker);

// ── Carousel ─────────────────────────────────────────────────────────────────
function buildCrs() {
  const all = getTokens();
  const top = [...all].sort((a, b) => (b.vol || 0) - (a.vol || 0)).slice(0, 10);
  if (!top.length) { document.getElementById('c-trk').innerHTML = '<div style="padding:16px;color:var(--muted);font-family:var(--mono);font-size:11px;">No tokens yet — launch the first one!</div>'; return; }
  document.getElementById('c-trk').innerHTML = top.map((t, i) => {
    const k = t.col === 'migrated' ? 'migrated' : t.mode === 'presale' ? 'presale' : 'bonding';
    return `<div class="ccard" data-k="${k}" onclick="window._app.openDet('${t.id}')">
      <div class="ccard-top">
        <div class="ccard-em">${t.em || '🎯'}</div>
        <div class="ccard-inf">
          <div class="ccard-rank">#${String(i + 1).padStart(2, '0')} · Volume Rank</div>
          <div class="ccard-name">${t.n}</div>
          <div class="ccard-tk">$${t.tk}</div>
        </div>
        <div class="ccard-pct ${(t.pct || 0) >= 0 ? 'up-c' : 'dn-c'}">${(t.pct || 0) >= 0 ? '+' : ''}${(t.pct || 0)}%</div>
      </div>
      <div class="ccard-foot">
        <div class="ccard-mc"><div class="ccard-mcl">Market Cap</div><div class="ccard-mcv">${fm(t.mc || 0)}</div></div>
        <div class="ccard-vol"><div class="ccard-voll">24h Volume</div><div class="ccard-volv">${fm(t.vol || 0)}</div></div>
      </div>
    </div>`;
  }).join('');
  updCrs();
}
function getCardW() { const vp = document.getElementById('c-vp'); return Math.floor((vp.clientWidth - (CV - 1) * 8) / CV); }
function updCrs() { const cw = getCardW(); document.querySelectorAll('.ccard').forEach(c => c.style.width = cw + 'px'); document.getElementById('c-trk').style.transform = `translateX(-${ci * (cw + 8)}px)`; document.getElementById('cprev').disabled = ci <= 0; document.getElementById('cnext').disabled = ci >= document.querySelectorAll('.ccard').length - CV; }
export function cMove(d) { ci = Math.max(0, ci + d); updCrs(); }

// ── Token columns ─────────────────────────────────────────────────────────────
function sortTokens(list, sort) {
  return [...list].sort((a, b) => {
    if (sort === 'date') return (b.createdAt || b.id) - (a.createdAt || a.id);
    if (sort === 'vol') return (b.vol || 0) - (a.vol || 0);
    if (sort === 'mc') return (b.mc || 0) - (a.mc || 0);
    if (sort === 'holders') return (b.h || 0) - (a.h || 0);
    if (sort === 'prog') return (b.prog || 0) - (a.prog || 0);
    if (sort === 'pct') return (b.pct || 0) - (a.pct || 0);
    return 0;
  });
}
function buildRow(t) {
  const up = (t.pct || 0) >= 0, cls = t.col === 'migrated' ? 't-g' : t.col === 'bonding' ? 't-b' : 't-n';
  const progBlk = t.col !== 'migrated' ? `<div class="tr-prog-row"><div class="tr-prog"><div class="tr-prog-f${(t.prog || 0) >= 100 ? ' full' : ''}" style="width:${t.prog || 0}%"></div></div><div class="tr-prog-pct${(t.prog || 0) >= 100 ? ' full' : ''}">${t.prog || 0}%</div></div>` : '';
  const age = t.createdAt ? fAge(t.createdAt) : (t.age || '—');
  const isCreator = isConnected() && getPublicKey()?.toBase58() === t.creator;
  const editBtn = isCreator ? `<button class="btn btn-ghost btn-sm" style="padding:3px 7px;font-size:9px;margin-left:6px;" onclick="event.stopPropagation();window._app.openEditToken('${t.id}')"><iconify-icon icon="solar:pen-bold" style="font-size:10px;"></iconify-icon> Edit</button>` : '';
  return `<div class="tr ${cls}" onclick="window._app.openDet('${t.id}')">
    <div class="tr-em">${t.em || '🎯'}</div>
    <div class="tr-inf">
      <div class="tr-row">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
          <span class="tr-name">${t.n}</span>
          <span class="tr-tk">$${t.tk}</span>
          ${editBtn}
        </div>
        <div class="tr-pct ${up ? 'up-c' : 'dn-c'}">${up ? '+' : ''}${(t.pct || 0)}%</div>
      </div>
      <div class="tr-row">
        <div class="tr-meta"><span>MC <b>${fm(t.mc || 0)}</b></span><span>V <b>${fm(t.vol || 0)}</b></span><span>H <b>${fh(t.h || 0)}</b></span></div>
        <div class="tr-age">${age}</div>
      </div>
      ${progBlk}
    </div>
  </div>`;
}
function renderCol(col) {
  let list = getTokens().filter(t => t.col === col);
  if (searchQ) list = list.filter(t => t.n.toLowerCase().includes(searchQ) || t.tk.toLowerCase().includes(searchQ));
  list = sortTokens(list, colSort[col]);
  document.getElementById('col-' + col).innerHTML = list.length ? list.map(buildRow).join('') : `<div style="padding:24px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--dim);">No tokens in this column</div>`;
  document.getElementById('cnt-' + col).textContent = list.length;
}
export function renderAll() {
  ['new', 'bonding', 'migrated'].forEach(renderCol);
  buildCrs();
  const all = getTokens();
  const tc = document.getElementById('hdr-token-count');
  if (tc) tc.textContent = all.length;
  const lc = document.getElementById('hdr-live-count');
  if (lc) lc.textContent = getActiveLives().length;
}
export function setColSort(btn) {
  const col = btn.dataset.col;
  document.querySelectorAll(`#flt-${col} .cf`).forEach(b => b.classList.remove('on'));
  btn.classList.add('on'); colSort[col] = btn.dataset.sort;
  const body = document.getElementById('col-' + col);
  body.style.opacity = '.2'; setTimeout(() => { renderCol(col); body.style.opacity = '1'; }, 120);
}
export function filterSearch(q) { searchQ = q.toLowerCase(); renderAll(); }

window.addEventListener('platform:token-added', renderAll);
window.addEventListener('platform:token-updated', renderAll);

// ── Token Detail ──────────────────────────────────────────────────────────────
export function openDet(id) {
  curTk = getToken(id); if (!curTk) return;
  tmode = 'buy'; rdeta(curTk);
  document.getElementById('tdm').classList.add('open');
}
export function closeDet() { document.getElementById('tdm').classList.remove('open'); }
export function setTm(m) { tmode = m; rdeta(curTk); }
export function setTa(v) { const el = document.getElementById('tinp'); if (el) { el.value = v; calcTrade(); } }

function chatHTML(t) {
  const footer = isConnected()
    ? `<div class="chat-foot"><input class="chat-inp" id="chat-inp" placeholder="Write a message..." onkeydown="window._app.chatKey(event)"><button class="chat-send" onclick="window._app.sendChat()"><iconify-icon icon="solar:arrow-right-bold"></iconify-icon></button></div>`
    : `<div class="chat-lock"><div class="chat-lock-t">Connect wallet to chat<small>Only connected wallets can post messages</small></div><button class="btn btn-primary btn-sm" onclick="window._app.walletClick(event)"><iconify-icon icon="solar:wallet-bold" style="font-size:12px;"></iconify-icon> Connect</button></div>`;
  return `<div class="chat-wrap">
    <div class="chat-head">
      <div class="chat-title"><iconify-icon icon="solar:chat-round-dots-bold" style="font-size:13px;"></iconify-icon>Token Chat</div>
      <div class="chat-online"><div class="dot"></div>Live chat</div>
    </div>
    <div class="chat-log" id="chat-log"></div>
    ${footer}
  </div>`;
}

function rdeta(t) {
  if (!t) return;
  document.getElementById('tdttl').innerHTML = `<span style="font-size:16px;">${t.em || '🎯'}</span> ${t.n} — <span style="color:var(--text);">$${t.tk}</span>`;
  const up = (t.pct || 0) >= 0, W = 520, H = 130;
  let y = H * .55, pts = [];
  for (let i = 0; i <= 60; i++) { y += ((Math.random() - .44) * 6); y = Math.max(12, Math.min(H - 12, y)); pts.push(`${(i / 60) * W},${y}`); }
  const col = up ? '#00E5A0' : '#FF2D2D', pd = 'M ' + pts.join(' L '), fd = pd + ` L ${W},${H} L 0,${H} Z`;
  const ib = tmode === 'buy';
  const bal = isConnected() ? getBalance().toFixed(3) + ' SOL' : '—';
  const pg = t.col !== 'migrated'
    ? `<div style="margin-top:6px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;"><div style="font-family:var(--mono);font-size:9.5px;font-weight:700;color:var(--dim);letter-spacing:1.2px;text-transform:uppercase;">Bonding</div><div style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--amber);">${t.prog || 0}%</div></div><div style="height:4px;background:rgba(255,255,255,.05);border-radius:99px;overflow:hidden;"><div style="height:100%;width:${t.prog || 0}%;background:var(--amber);border-radius:99px;"></div></div><div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:5px;">${t.prog || 0}/100 SOL raised</div></div>`
    : `<div style="font-family:var(--mono);font-size:10.5px;color:var(--up);background:var(--up-soft);border:1px solid var(--up-bdr);padding:9px 12px;border-radius:6px;display:flex;align-items:center;gap:7px;"><iconify-icon icon="solar:check-circle-bold" style="font-size:13px;"></iconify-icon> Graduated · Raydium CPMM · Buyback active</div>`;
  const imgSrc = t.imageUrl ? `<img src="${t.imageUrl}" style="width:60px;height:60px;border-radius:10px;object-fit:cover;" alt="${t.n}">` : `<div class="td-av">${t.em || '🎯'}</div>`;
  document.getElementById('tdbody').innerHTML = `<div class="tdlay">
    <div class="tdl">
      <div class="td-hero">${imgSrc}<div><div class="td-n">${t.n}</div><div class="td-tk">$${t.tk}</div><div class="td-dsc">${t.d2 || ''}</div></div></div>
      <div class="td-sg">
        <div class="td-st"><div class="td-sl">MC</div><div class="td-sv">${fm(t.mc || 0)}</div></div>
        <div class="td-st"><div class="td-sl">Vol</div><div class="td-sv">${fm(t.vol || 0)}</div></div>
        <div class="td-st"><div class="td-sl">Hold</div><div class="td-sv">${(t.h || 0).toLocaleString()}</div></div>
        <div class="td-st"><div class="td-sl">24h</div><div class="td-sv ${up ? 'up-c' : 'dn-c'}">${up ? '+' : ''}${t.pct || 0}%</div></div>
      </div>
      <div class="td-ch"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${col}" stop-opacity=".25"/><stop offset="100%" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${fd}" fill="url(#cg)"/><path d="${pd}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg></div>
      ${pg}
    </div>
    <div class="tdr">
      <div class="tpanel">
        <div class="ttabs"><button class="ttab ${ib ? 'b' : ''}" onclick="window._app.setTm('buy')">Buy</button><button class="ttab ${!ib ? 's' : ''}" onclick="window._app.setTm('sell')">Sell</button></div>
        <div class="t-bal">${ib ? 'Balance: ' + bal : 'Balance: — $' + t.tk}</div>
        <div class="t-lbl">${ib ? 'Amount (SOL)' : 'Amount ($' + t.tk + ')'}</div>
        <input class="t-inp" id="tinp" type="number" placeholder="0.00" oninput="window._app.calcTrade()">
        <div class="t-qk"><div class="t-qb" onclick="window._app.setTa(.1)">0.1</div><div class="t-qb" onclick="window._app.setTa(.5)">0.5</div><div class="t-qb" onclick="window._app.setTa(1)">1</div><div class="t-qb" onclick="window._app.setTa(5)">5</div></div>
        <div class="t-info">Fee 1%<br>${ib ? 'Max 1% supply' : 'Tax 24% → buyback'}</div>
        <div class="t-rcv" id="trcv">You get: <span>—</span></div>
        <button class="t-sub ${tmode}" onclick="window._app.doTrade()" id="tbtn">${ib ? 'Buy $' + t.tk : 'Sell $' + t.tk}</button>
      </div>
    </div>
  </div>
  ${chatHTML(t)}`;
}

export function calcTrade() {
  if (!curTk) return;
  const a = parseFloat(document.getElementById('tinp')?.value) || 0;
  const r = tmode === 'buy' ? `≈ ${Math.floor(a * 1e6 * .99).toLocaleString()} $${curTk.tk}` : `≈ ${(a * 1e-6 * .75).toFixed(4)} SOL`;
  const el = document.getElementById('trcv');
  if (el) el.innerHTML = `You get: <span>${r}</span>`;
}

export async function doTrade() {
  if (!isConnected()) { showN('Please connect wallet first'); return; }
  const a = document.getElementById('tinp')?.value || '0';
  const btn = document.getElementById('tbtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
  try {
    if (curTk?.mint) {
      const inputMint = tmode === 'buy' ? CONFIG.MINTS.SOL : curTk.mint;
      const outputMint = tmode === 'buy' ? curTk.mint : CONFIG.MINTS.SOL;
      const decimals = tmode === 'buy' ? 9 : (curTk.decimals || 6);
      const amount = toRawAmount(a, decimals);
      const quote = await getQuote({ inputMint, outputMint, amount });
      const sig = await executeSwap(quote);
      showN(`✓ ${tmode === 'buy' ? 'Bought' : 'Sold'} $${curTk.tk} · ${sig.slice(0, 8)}...`);
      await refreshBalance();
    } else {
      showN(`${tmode === 'buy' ? 'Buying' : 'Selling'} ${a} ${tmode === 'buy' ? 'SOL → $' + curTk.tk : '$' + curTk.tk + ' → SOL'} (on-chain tx coming soon)`);
    }
  } catch (err) {
    showN('Trade failed: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = (tmode === 'buy' ? 'Buy $' : 'Sell $') + curTk.tk; }
  }
}

export function chatKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }
export function sendChat() {
  if (!isConnected()) { showN('Please connect wallet to chat'); return; }
  const inp = document.getElementById('chat-inp');
  const v = inp.value.trim(); if (!v) return;
  const log = document.getElementById('chat-log');
  const addr = getShortAddress() || 'You';
  log.innerHTML += `<div class="chm me"><div class="chm-av">${addr.slice(0, 2).toUpperCase()}</div><div class="chm-b"><div class="chm-h">You<span>just now</span></div><div class="chm-t">${v.replace(/</g, '&lt;')}</div></div></div>`;
  inp.value = '';
  log.scrollTop = log.scrollHeight;
}

// ── Edit Token ────────────────────────────────────────────────────────────────
export function openEditToken(id) {
  const t = getToken(id);
  if (!t) return;
  if (!isConnected() || getPublicKey()?.toBase58() !== t.creator) { showN('Only the token creator can edit'); return; }
  document.getElementById('edit-modal').classList.add('open');
  document.getElementById('edit-id').value = id;
  document.getElementById('edit-name').value = t.n || '';
  document.getElementById('edit-desc').value = t.d2 || '';
  document.getElementById('edit-website').value = t.website || '';
  document.getElementById('edit-twitter').value = t.twitter || '';
  document.getElementById('edit-telegram').value = t.telegram || '';
}
export function closeEditToken() { document.getElementById('edit-modal').classList.remove('open'); }
export async function saveEditToken() {
  const id = Number(document.getElementById('edit-id').value);
  const updates = {
    n: document.getElementById('edit-name').value.trim(),
    d2: document.getElementById('edit-desc').value.trim(),
    website: document.getElementById('edit-website').value.trim(),
    twitter: document.getElementById('edit-twitter').value.trim(),
    telegram: document.getElementById('edit-telegram').value.trim(),
  };
  const editImg = document.getElementById('edit-img').files[0];
  const btn = document.querySelector('#edit-modal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
    if (editImg) {
      const result = await uploadFileToPinata(editImg, `${updates.n}_image`);
      updates.imageUrl = result.url;
    }
    updateToken(id, updates);
    showN('Token updated');
    closeEditToken();
    renderAll();
  } catch (err) {
    showN('Update failed: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

// ── Jupiter Swap Modal ────────────────────────────────────────────────────────
let swapDebounce = null;
export function openSwap() { document.getElementById('sm').classList.add('open'); initSwapSelects(); cswap(); }
export function closeSwap() { document.getElementById('sm').classList.remove('open'); }
export function flipSwap() {
  const f = document.getElementById('sft-input'), t = document.getElementById('stt-input');
  const tmp = f.value; f.value = t.value; t.value = tmp;
  [swapTokenIn, swapTokenOut] = [swapTokenOut, swapTokenIn];
  cswap();
}

function initSwapSelects() {
  const tokenList = [
    { symbol: 'SOL', mint: CONFIG.MINTS.SOL },
    { symbol: 'USDC', mint: CONFIG.MINTS.USDC },
    { symbol: 'BONK', mint: CONFIG.MINTS.BONK },
    { symbol: 'WIF', mint: CONFIG.MINTS.WIF },
    ...getTokens().filter(t => t.mint).map(t => ({ symbol: t.tk, mint: t.mint })),
  ];
  swapTokenIn = tokenList[0];
  swapTokenOut = tokenList[2];
  ['sft', 'stt'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = tokenList.map(t => `<option value="${t.mint}" ${i === 0 && t.symbol === 'SOL' ? 'selected' : i === 1 && t.symbol === 'BONK' ? 'selected' : ''}>${t.symbol}</option>`).join('');
    el.onchange = () => cswap();
  });
}

export function cswap() {
  clearTimeout(swapDebounce);
  swapDebounce = setTimeout(async () => {
    const inMint = document.getElementById('sft')?.value || CONFIG.MINTS.SOL;
    const outMint = document.getElementById('stt')?.value || CONFIG.MINTS.BONK;
    const amtRaw = parseFloat(document.getElementById('sfa')?.value) || 0;
    if (!amtRaw) return;
    const amount = toRawAmount(amtRaw, 9);
    try {
      swapQuote = await getQuote({ inputMint: inMint, outputMint: outMint, amount });
      const outDecimals = 6;
      const outAmt = formatAmount(swapQuote.outAmount, outDecimals);
      const rate = outAmt / amtRaw;
      const el = document.getElementById('sta');
      if (el) el.value = outAmt > 1000 ? outAmt.toLocaleString('en', { maximumFractionDigits: 0 }) : outAmt.toFixed(6);
      const srt = document.getElementById('srt');
      if (srt) srt.textContent = `1 input ≈ ${rate > 1000 ? rate.toLocaleString('en', { maximumFractionDigits: 0 }) : rate.toFixed(6)} output`;
      const sfee = document.getElementById('sfee');
      if (sfee) sfee.textContent = (amtRaw * 0.001).toFixed(4) + ' input';
      const spi = document.getElementById('spi');
      if (spi) spi.textContent = ((swapQuote.priceImpactPct || 0) * 100).toFixed(2) + '%';
      const smin = document.getElementById('smin');
      if (smin) smin.textContent = (outAmt * 0.995).toFixed(4) + ' output';
      const srte = document.getElementById('srte');
      if (srte) srte.textContent = (swapQuote.routePlan || []).map(r => r.swapInfo?.label || '').filter(Boolean).join(' · ') || 'Jupiter';
    } catch (e) {
      const sta = document.getElementById('sta');
      if (sta) sta.value = '';
    }
  }, 400);
}

export async function doSwap() {
  if (!isConnected()) { showN('Connect wallet to swap'); return; }
  if (!swapQuote) { showN('Get a quote first'); return; }
  const btn = document.querySelector('#sm .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Swapping...'; }
  try {
    const sig = await executeSwap(swapQuote);
    showN(`✓ Swap confirmed · ${sig.slice(0, 8)}...`);
    await refreshBalance(); updateWalletUI(); closeSwap();
  } catch (e) {
    showN('Swap failed: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Swap'; }
  }
}

// ── Launch Modal ──────────────────────────────────────────────────────────────
function showOnly(...ids) {
  ['llobby', 'lfa', 'lprev', 'lsuccess'].forEach(id => document.getElementById(id).style.display = 'none');
  ids.forEach(id => document.getElementById(id).style.display = '');
}
function stepUI(a) { for (let i = 1; i <= 4; i++) { const el = document.getElementById('s' + i); el.classList.toggle('on', i === a); el.classList.toggle('done', i < a); } }
export function openLaunch() { document.getElementById('lm').classList.add('open'); goStep1(); }
export function closeLaunch() { document.getElementById('lm').classList.remove('open'); imageFileGlobal = null; }
export function selMode(m) { selM = m; document.getElementById('mbc').classList.toggle('sel', m === 'bonding'); document.getElementById('mps').classList.toggle('sel', m === 'presale'); }
export function goStep1() { selM = null; document.querySelectorAll('.mcard').forEach(c => c.classList.remove('sel')); stepUI(1); showOnly('llobby'); }
export function goStep2() { if (!selM) { showN('Select a mode first'); return; } stepUI(2); showOnly('lfa'); document.getElementById('lfa').style.display = 'block'; buildForm(selM); }
export function goStep2b() { stepUI(2); showOnly('lfa'); document.getElementById('lfa').style.display = 'block'; }

export function goStep3() {
  const name = document.getElementById('f-name')?.value?.trim();
  const tick = (document.getElementById('f-tick')?.value || 'TOKEN').toUpperCase().trim();
  const desc = document.getElementById('f-desc')?.value?.trim() || '';
  if (!name) { showN('Token name is required'); return; }
  if (!tick) { showN('Ticker is required'); return; }
  fData = { name, tick, desc };
  imageFileGlobal = document.getElementById('f-img')?.files[0] || null;
  stepUI(3); showOnly('lprev');
  document.getElementById('prev-name').textContent = name;
  document.getElementById('prev-tk').textContent = '$' + tick;
  document.getElementById('prev-desc').textContent = desc;
  document.getElementById('prev-mode').textContent = selM === 'presale' ? 'Presale' : 'Bonding';
  if (imageFileGlobal) {
    const url = URL.createObjectURL(imageFileGlobal);
    document.querySelector('.prev-img').innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" alt="">`;
  }
}

export async function doLaunch() {
  if (!isConnected()) { showN('Connect wallet to launch a token'); return; }
  const btn = document.querySelector('#lprev .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Launching...'; }
  try {
    const { createToken } = await import('./tokens.js');
    const result = await createToken({
      name: fData.name, symbol: fData.tick, description: fData.desc,
      imageFile: imageFileGlobal,
      website: document.getElementById('f-web')?.value || '',
      twitter: document.getElementById('f-twt')?.value || '',
      telegram: document.getElementById('f-tg')?.value || '',
      mode: selM || 'bonding',
    });
    stepUI(4); showOnly('lsuccess');
    document.getElementById('suc-sub').textContent = `// $${fData.tick} is live · ${result.mint.slice(0, 8)}...`;
    document.getElementById('suc-sig').href = `https://solscan.io/tx/${result.sig}`;
    const wantLive = document.getElementById('f-start-live')?.checked;
    if (wantLive) setTimeout(() => openLiveStream(result.token), 1500);
    renderAll(); refreshTicker();
  } catch (err) {
    showN('Launch failed: ' + err.message); console.error(err);
    if (btn) { btn.disabled = false; btn.textContent = 'Launch'; }
  }
}

function buildForm(mode) {
  const bc = mode === 'bonding';
  document.getElementById('lfc').innerHTML = `
    <div class="igrid">
      <div class="igr"><span class="igk">Migration</span><span class="igv">${bc ? '100 SOL' : '100-10K SOL'}</span></div>
      <div class="igr"><span class="igk">Max Wallet</span><span class="igv">1%</span></div>
      <div class="igr"><span class="igk">Buy Fee</span><span class="igv">1%</span></div>
      <div class="igr"><span class="igk">Sell</span><span class="igv">${bc ? '1%+24%→buyback' : 'No sell pre-mig'}</span></div>
    </div>
    <div class="fstit">Identity</div>
    <div class="frow">
      <div class="ff"><label class="fl">Name *</label><input class="fi" id="f-name" placeholder="Red Carpet Inu" maxlength="32"></div>
      <div class="ff"><label class="fl">Ticker *</label><input class="fi" id="f-tick" placeholder="RCINU" maxlength="8" style="text-transform:uppercase"></div>
    </div>
    <div class="ff"><label class="fl">Description</label><textarea class="fta" id="f-desc" placeholder="Tell your story..."></textarea></div>
    <div class="fstit">Media</div>
    <div class="frow">
      <div class="ff">
        <label class="fl">Token Image</label>
        <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border:1px dashed var(--red-bdr);border-radius:6px;cursor:pointer;transition:all .15s;" id="img-label" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--red-bdr)'">
          <iconify-icon icon="solar:upload-bold" style="font-size:18px;color:var(--red);"></iconify-icon>
          <span id="img-label-txt" style="font-family:var(--mono);font-size:11px;color:var(--muted);">Upload from device (PNG/JPG/GIF · max 10MB)</span>
          <input type="file" id="f-img" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;" onchange="window._app.previewImage(this)">
        </label>
        <div id="img-preview" style="display:none;margin-top:8px;"><img id="img-prev-el" style="width:80px;height:80px;border-radius:8px;object-fit:cover;border:1px solid var(--red-bdr);" alt="preview"></div>
      </div>
      <div class="ff"><label class="fl">Website</label><input class="fi" id="f-web" placeholder="https://..."></div>
    </div>
    <div class="fstit">Socials</div>
    <div class="frow">
      <div class="ff"><label class="fl">Twitter</label><input class="fi" id="f-twt" placeholder="@handle"></div>
      <div class="ff"><label class="fl">Telegram</label><input class="fi" id="f-tg" placeholder="t.me/..."></div>
    </div>
    <div class="fstit">Options</div>
    <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg);border:1px solid var(--line);border-radius:6px;cursor:pointer;margin-bottom:10px;" onclick="document.getElementById('f-start-live').click()">
      <input type="checkbox" id="f-start-live" style="width:16px;height:16px;accent-color:var(--red);cursor:pointer;">
      <div>
        <div style="font-family:var(--mono);font-size:11.5px;font-weight:700;color:var(--text);">Start Live Stream after launch</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:2px;">Begin a live stream immediately after token creation</div>
      </div>
    </div>
    <!-- Banner section -->
    <div class="ban-toggle" onclick="window._app.toggleBan()" id="ban-tog">
      <div class="ban-l">
        <iconify-icon icon="solar:gallery-bold" style="font-size:18px;color:var(--amber);"></iconify-icon>
        <div>
          <div class="ban-title">Add Banner</div>
          <div class="ban-sub">Promote your token with a featured banner</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--amber);">0.2 SOL</div>
        <iconify-icon icon="solar:arrow-down-bold" id="ban-arr" style="font-size:14px;color:var(--muted);"></iconify-icon>
      </div>
    </div>
    <div class="ban-body" id="ban-body">
      <div class="ban-drop" onclick="document.getElementById('f-ban').click()">
        <iconify-icon icon="solar:gallery-add-bold" style="font-size:28px;color:var(--red);"></iconify-icon>
        <div class="ban-drop-t">Upload Banner Image</div>
        <div class="ban-drop-h">PNG, JPG or GIF · Recommended 1200×400px · Max 5MB</div>
        <input type="file" id="f-ban" accept="image/*" style="display:none;" onchange="window._app.previewBanner(this)">
      </div>
      <div id="ban-preview" style="display:none;margin-top:8px;"><img id="ban-prev-el" style="width:100%;border-radius:6px;object-fit:cover;max-height:120px;" alt="banner"></div>
      <div style="margin-top:10px;padding:10px 14px;background:var(--amber-soft);border:1px solid var(--amber-bdr);border-radius:6px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-family:var(--mono);font-size:11px;color:var(--amber);">Banner placement fee</div>
        <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--amber);">0.2 SOL</div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="window._app.payBanner()"><iconify-icon icon="solar:wallet-bold" style="font-size:12px;"></iconify-icon> Confirm Banner — 0.2 SOL</button>
    </div>`;
}

export function previewImage(input) {
  const file = input.files[0]; if (!file) return;
  const url = URL.createObjectURL(file);
  document.getElementById('img-prev-el').src = url;
  document.getElementById('img-preview').style.display = 'block';
  document.getElementById('img-label-txt').textContent = file.name;
}
export function previewBanner(input) {
  const file = input.files[0]; if (!file) return;
  bannerFileGlobal = file;
  const url = URL.createObjectURL(file);
  document.getElementById('ban-prev-el').src = url;
  document.getElementById('ban-preview').style.display = 'block';
}
export function toggleBan() {
  const body = document.getElementById('ban-body'), arr = document.getElementById('ban-arr');
  body.classList.toggle('open');
  arr.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : '';
}
export async function payBanner() {
  if (!isConnected()) { showN('Connect wallet to add banner'); return; }
  if (!bannerFileGlobal) { showN('Upload a banner image first'); return; }
  showN('Banner payment: coming soon. UI ready, payment integration TBD.');
}

// ── Live View ─────────────────────────────────────────────────────────────────
export function buildLive() {
  const lives = getActiveLives();
  const lc = l => {
    const age = l.startedAt ? fAge(l.startedAt) : '';
    return `<div onclick="window._app.openLiveRoom('${l.id}')" style="background:var(--bg-3);border:1px solid var(--line);border-radius:8px;overflow:hidden;position:relative;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;font-size:58px;cursor:pointer;transition:all .2s;" onmouseenter="this.style.borderColor='var(--red)';this.style.boxShadow='0 0 16px var(--red-glow)'" onmouseleave="this.style.borderColor='var(--line)';this.style.boxShadow='none'">
      🎥
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(5,8,14,.92));display:flex;flex-direction:column;justify-content:flex-end;padding:12px 14px;">
        <div style="position:absolute;top:10px;left:10px;display:flex;align-items:center;gap:6px;background:var(--red);color:#fff;padding:4px 9px;border-radius:4px;font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;"><div style="width:5px;height:5px;border-radius:50%;background:#fff;animation:pulse 1.2s ease-in-out infinite;"></div>Live</div>
        <div style="position:absolute;top:10px;right:10px;font-family:var(--mono);font-size:10px;background:var(--bg-2);border:1px solid var(--line);padding:3px 8px;border-radius:4px;color:var(--text);font-weight:600;display:flex;align-items:center;gap:4px;"><iconify-icon icon="solar:eye-bold" style="font-size:10px;"></iconify-icon> ${l.viewers || 0}</div>
        <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--text);letter-spacing:.3px;">${l.tokenName || 'Untitled Stream'}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:2px;">$${l.tokenTicker || '???'} · ${l.creatorShort || ''} · ${age}</div>
      </div>
    </div>`;
  };
  const topEl = document.getElementById('top-lives');
  const gridEl = document.getElementById('live-grid');
  if (!lives.length) {
    const empty = '<div style="padding:32px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--dim);grid-column:1/-1;">No active streams. Launch a token and start a live!</div>';
    if (topEl) topEl.innerHTML = empty;
    if (gridEl) gridEl.innerHTML = '';
    return;
  }
  const sorted = [...lives].sort((a, b) => (b.viewers || 0) - (a.viewers || 0));
  if (topEl) topEl.innerHTML = sorted.slice(0, 3).map(lc).join('');
  if (gridEl) gridEl.innerHTML = sorted.map(lc).join('');
}

export async function openLiveRoom(liveId) {
  const lives = getLives();
  const live = lives.find(l => l.id == liveId);
  if (!live) return;
  document.getElementById('live-room-modal').classList.add('open');
  document.getElementById('lr-token').textContent = '$' + (live.tokenTicker || '???');
  document.getElementById('lr-name').textContent = live.tokenName || 'Stream';
  const video = document.getElementById('lr-video');
  try {
    const ident = isConnected() ? getPublicKey().toBase58() : 'viewer-' + Date.now();
    const room = await joinLive(live.roomName, video, ident);
    onChatMessage(msg => appendLiveChat(msg));
    window._liveRoom = room;
  } catch (e) {
    showN('Could not join stream: ' + e.message);
  }
}
export function closeLiveRoom() {
  if (window._liveRoom) { window._liveRoom.disconnect(); window._liveRoom = null; }
  document.getElementById('live-room-modal').classList.remove('open');
}
export async function sendLiveChat() {
  const inp = document.getElementById('lr-chat-inp');
  const v = inp?.value.trim(); if (!v) return;
  const name = isConnected() ? getShortAddress() : 'Anon';
  await sendChatMessage(window._liveRoom, v, name);
  inp.value = '';
}
function appendLiveChat(msg) {
  const log = document.getElementById('lr-chat-log');
  if (!log) return;
  const cls = msg.self ? 'me' : '';
  log.innerHTML += `<div class="chm ${cls}"><div class="chm-av">${(msg.name || 'A').slice(0, 2).toUpperCase()}</div><div class="chm-b"><div class="chm-h">${msg.name || 'Anon'}</div><div class="chm-t">${msg.text.replace(/</g, '&lt;')}</div></div></div>`;
  log.scrollTop = log.scrollHeight;
}

export async function openLiveStream(token) {
  if (!isConnected()) { showN('Connect wallet to start a live'); return; }
  try {
    const { room, liveId } = await startLive({
      tokenMint: token?.mint,
      tokenName: token?.n || 'Untitled',
      tokenTicker: token?.tk || '???',
    });
    currentLiveId = liveId;
    activeRoom = room;
    showN('🔴 Live stream started!');
  } catch (e) {
    showN('Stream failed: ' + e.message);
  }
}

// ── Bubble Map ─────────────────────────────────────────────────────────────────
export function buildBvChips() {
  const tokens = getTokens();
  if (!tokens.length) { document.getElementById('bv-chips').innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--dim);">No tokens launched yet</div>'; return; }
  if (!bvActive) bvActive = tokens[0].id;
  const q = bvFilter.toLowerCase();
  const list = tokens.filter(t => !q || t.n.toLowerCase().includes(q) || t.tk.toLowerCase().includes(q));
  document.getElementById('bv-chips').innerHTML = '<div class="bv-quick-lbl">Quick Select:</div>' + list.map(t =>
    `<div class="bv-chip${t.id === bvActive ? ' on' : ''}" onclick="window._app.selBvToken('${t.id}')"><span class="bv-chip-em">${t.em || '🎯'}</span>$${t.tk}</div>`
  ).join('');
}
export function filterBvChips(q) { bvFilter = q; buildBvChips(); }
export function selBvToken(id) { bvActive = id; buildBvChips(); renderBvMap(); }

export function renderBvMap() {
  const t = getToken(bvActive);
  if (!t) {
    document.getElementById('bv-insight').innerHTML = 'Select a token to view its holder distribution.';
    return;
  }
  document.getElementById('bv-em').textContent = t.em || '🎯';
  document.getElementById('bv-name').textContent = t.n;
  document.getElementById('bv-tk').textContent = '$' + t.tk;
  document.getElementById('bv-insight').innerHTML = `Token <b>${t.n}</b> was launched on Carpet. On-chain holder data requires a Solana RPC call — connect to a real RPC endpoint with the <code>getTokenLargestAccounts</code> method. This view will show real holders when connected.`;
  document.getElementById('bv-linked').innerHTML = 'Connect to Solana mainnet RPC to fetch real holder data.';
  document.getElementById('bv-t10').textContent = '—';
  document.getElementById('bv-dev').textContent = '—';
  document.getElementById('bv-hold').textContent = fh(t.h || 0);
  document.getElementById('bv-hp').textContent = '—';
  document.getElementById('bv-svg').innerHTML = '<text x="50%" y="50%" text-anchor="middle" font-family="ui-monospace,monospace" font-size="13" fill="rgba(238,240,245,.34)">On-chain data pending RPC connection</text>';
}

// ── Rewards ───────────────────────────────────────────────────────────────────
export function renderRewards() {
  const rewards = getRewards();
  const dist = document.getElementById('rw-dist-list');
  if (dist) {
    if (!rewards.length) {
      dist.innerHTML = '<div style="padding:24px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--dim);">No rewards distributed yet. Tokens need to hit volume milestones.</div>';
    } else {
      dist.innerHTML = rewards.map(d => {
        const t = getToken(d.tokenId);
        return `<div class="rw-dist-row" onclick="window._app.openDet('${d.tokenId}')">
          <div class="rw-dist-time">${new Date(d.time || Date.now()).toLocaleTimeString()}</div>
          <div class="rw-dist-tk"><div class="rw-dist-em">${t?.em || '🎯'}</div><div><div class="rw-dist-n">${t?.n || '—'}</div><div class="rw-dist-tkv">$${t?.tk || '—'}</div></div></div>
          <div class="rw-dist-tier">${d.tier}</div>
          <div class="rw-dist-vol">${d.vol}<small> volume</small></div>
          <div class="rw-dist-amt">+${d.amt}<small> burned</small></div>
        </div>`;
      }).join('');
    }
  }
  const grid = document.getElementById('rw-topgrid');
  if (grid) grid.innerHTML = '<div style="padding:24px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--dim);grid-column:1/-1;">Reward data loads from on-chain events.</div>';
}

// ── Profile ───────────────────────────────────────────────────────────────────
export function pfTab(el, tab) {
  document.querySelectorAll('.pf-tab').forEach(t => t.classList.remove('on'));
  if (el) el.classList.add('on');
  const c = document.getElementById('pf-content');
  if (!isConnected()) { c.innerHTML = '<div style="padding:32px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--muted);">Connect wallet to view your profile</div>'; return; }
  const myAddr = getPublicKey()?.toBase58();
  if (tab === 'balances') {
    c.innerHTML = '<div style="padding:32px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--muted);">Loading balances...<br><small>Full SPL token balance view requires Helius/RPC integration</small></div>';
  } else if (tab === 'created') {
    const created = getTokens().filter(t => t.creator === myAddr);
    c.innerHTML = created.length
      ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">${created.map(buildRow).join('')}</div>`
      : '<div style="padding:24px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--dim);">No tokens created yet</div>';
  } else if (tab === 'activity') {
    c.innerHTML = '<div style="padding:24px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--muted);">Activity log — connect to RPC for on-chain history</div>';
  } else if (tab === 'rewards') {
    c.innerHTML = '<div style="padding:24px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--muted);">Rewards earned from volume milestones appear here</div>';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function init() {
  renderAll();
  refreshTicker();
  buildBvChips();
  requestAnimationFrame(() => setTimeout(updCrs, 100));

  document.addEventListener('click', e => {
    if (!e.target.closest('#cbtn') && !e.target.closest('#wmenu')) closeWMenu();
  });
  document.querySelectorAll('.ov').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));
  document.getElementById('tdm').addEventListener('click', e => { if (e.target === document.getElementById('tdm')) closeDet(); });
  window.addEventListener('resize', () => { updCrs(); });

  // Expose all public functions to window for inline HTML handlers
  window._app = {
    walletClick, disconnectWalletUI, toggleWMenu, closeWMenu, copyAddrUI, openSolscan,
    toggleSb, setView, goProfile,
    openDet, closeDet, setTm, setTa, calcTrade, doTrade, chatKey, sendChat,
    openEditToken, closeEditToken, saveEditToken,
    openSwap, closeSwap, flipSwap, cswap, doSwap,
    openLaunch, closeLaunch, selMode, goStep1, goStep2, goStep2b, goStep3, doLaunch,
    previewImage, previewBanner, toggleBan, payBanner,
    buildLive, openLiveRoom, closeLiveRoom, sendLiveChat, openLiveStream,
    buildBvChips, filterBvChips, selBvToken, renderBvMap,
    renderRewards,
    pfTab,
    cMove, setColSort, filterSearch,
    showN,
    renderProfile, openEditProfile, closeEditProfile,
    uploadProfileAvatar, uploadProfileBanner,
    saveProfile: saveProfileFn, shareProfile,
  };

  // Expose as globals so existing onclick="fn()" HTML attributes work
  Object.entries(window._app).forEach(([k, v]) => { window[k] = v; });
  // Legacy alias used in static HTML
  window.copyAddr = window.copyAddrUI;

   initProfile(); 
   
  // Auto-reconnect if previously connected
  const provider = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
  if (provider) {
    provider.connect({ onlyIfTrusted: true })
      .then(() => {})
      .catch(() => {});
  }
}

init();
