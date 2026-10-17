import { startSolPrice, fmtSolAsUsd } from './usd.js';
import { PAGE_KEYS, renderPage, bindPages } from './pages/pages.js';
import { esc } from './escape.js';
import { tokenAvatar } from './avatar.js';
import {
  connectWallet, disconnectWallet, isConnected,
  getPublicKey, getBalance, getShortAddress,
  copyAddress, refreshBalance, onWalletChange,
  getAnchorWallet, getSupportedWallets,
} from './wallet.js';
import {
  buyBonding,
  sellBonding,
  contributePresale,
  claimPresale,
  claimCreatorTokens,
  solscanAccountUrl,
  solscanTxUrl,
} from './launchpad.js';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getQuote, executeSwap, searchTokens, getTokenInfo,
  formatAmount, toRawAmount,
} from './jupiter.js';
import { uploadFileToPinata, uploadTokenMetadata } from './ipfs.js';
import {
  getTokens, getToken, addToken, updateToken, deleteToken,
  getTickerTokens, mergeIndexedTokens,
} from './platform.js';
import { CONFIG } from './config.js';
import {
     renderProfile, openEditProfile, closeEditProfile,
     uploadProfileAvatar, uploadProfileBanner,
     saveProfile as saveProfileFn, shareProfile,
     initProfile,
   } from './profile.js';


import { mountTokenDetail, unmountTokenDetail } from './token-detail/token-detail.js';
   

// ── Globals ──────────────────────────────────────────────────────────────────
let sbOpen = false;
let ci = 0; const CV = 3;
const colSort = { new: 'date', bonding: 'prog', migrated: 'date' };
let searchQ = '';
let swapTokenIn = null, swapTokenOut = null;
let swapQuote = null;
let imageFileGlobal = null;
let selM = null, presaleM = 0, fData = {};

// ── Formatters ───────────────────────────────────────────────────────────────
// Market cap / volume arrive in SOL; show them in dollars like every launchpad.
const fm = (sol) => fmtSolAsUsd(Number(sol) || 0);
function fh(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n); }
function fAge(ts) { const s = (Date.now() - ts) / 1000; if (s < 60) return Math.floor(s) + 's'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; }

// ── Notification bar ─────────────────────────────────────────────────────────
export function showN(msg) {
  const b = document.getElementById('nbar');
  b.textContent = msg; b.style.display = 'block';
  clearTimeout(b._t); b._t = setTimeout(() => b.style.display = 'none', 3800);
}
function showTxN(label, sig) {
  const b = document.getElementById('nbar');
  b.innerHTML = `${label} · <a href="${solscanTxUrl(sig)}" target="_blank" rel="noreferrer" style="color:inherit;text-decoration:underline;">${sig.slice(0, 8)}...</a>`;
  b.style.display = 'block';
  clearTimeout(b._t); b._t = setTimeout(() => b.style.display = 'none', 7000);
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
  refreshTicker();
}

export function disconnectWalletUI() { disconnectWallet().then(() => { closeWMenu(); showN('Wallet disconnected'); }); }
export function toggleWMenu() { document.getElementById('wmenu').classList.toggle('open'); }
export function closeWMenu() { document.getElementById('wmenu').classList.remove('open'); }
export async function copyAddrUI() { await copyAddress(); showN('Address copied'); closeWMenu(); }
export function openSolscan() {
  const pk = getPublicKey();
  if (pk) window.open(solscanAccountUrl(pk), '_blank');
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
  // Hide token detail mount (used by openDet) when switching to a top-level view
  const tdMount = document.getElementById('td-mount');
  if (tdMount) tdMount.style.display = 'none';
  // Also unmount the token detail to clean up its WS / fetchers
  try { unmountTokenDetail(); } catch {}

  const isPage = PAGE_KEYS.includes(v);
  ['home', 'profile', 'page'].forEach(id => {
    const el = document.getElementById(id + '-view');
    if (el) el.style.display = (isPage ? id === 'page' : id === v) ? (id === 'page' ? 'block' : 'flex') : 'none';
  });
  document.querySelectorAll('#sb .sbi[id^="si-"]').forEach(sbi => sbi.classList.toggle('on', sbi.id === 'si-' + v));
  closeMoreSheet();
  // Docs writes ?view=docs#section into the URL; drop it when leaving.
  if (v !== 'docs' && location.search.includes('view=docs')) history.replaceState(null, '', location.pathname);
  if (isPage) renderPage(v, document.getElementById('page-view'));
  if (v === 'home') setTimeout(updCrs, 60);
  if (v === 'profile') renderProfile();
}
export function goProfile() { setView('profile'); closeWMenu(); }


export function openDet(id) {
  const token = getToken(id);
  if (!token || !token.mint) {
    showN('Token not found');
    return;
  }
  const container = document.getElementById('td-mount');
  if (!container) {
    console.error('[main] #td-mount not found in DOM');
    return;
  }
  // Show the mount container, hide other views.
  ['home', 'profile', 'page'].forEach(v => {
    const el = document.getElementById(v + '-view');
    if (el) el.style.display = 'none';
  });
  container.style.display = 'flex';

  mountTokenDetail(container, {
    mint:    token.mint,
    onBack:  () => {
      unmountTokenDetail();
      container.style.display = 'none';
      setView('home');
    },
    onTrade: async ({ mint, side, amount }) => {
      if (!isConnected()) {
        showN('Connect wallet first');
        return;
      }
      try {
        const wallet = getAnchorWallet();
        if (side === 'claimPresale') {
          const sig = await claimPresale(wallet, mint);
          showTxN('Presale claim confirmed', sig);
        } else if (token.mode === 'presale' && token.col !== 'migrated') {
          const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
          const sig = await contributePresale(wallet, mint, lamports);
          showTxN('Presale contribution confirmed', sig);
        } else if (side === 'buy') {
          const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
          const sig = await buyBonding(wallet, mint, lamports);
          showTxN('Buy confirmed', sig);
        } else {
          const decimals = token.decimals || 6;
          const tokenAmount = Math.floor(amount * Math.pow(10, decimals));
          const sig = await sellBonding(wallet, mint, tokenAmount);
          showTxN('Sell confirmed', sig);
        }
        await refreshBalance();
      } catch (err) {
        showN('Trade failed: ' + err.message);
      }
    },
  });
}

// ── Ticker ───────────────────────────────────────────────────────────────────
export function refreshTicker() {
  const tokens = getTickerTokens();
  if (!tokens.length) return;
  const inner = document.querySelector('.ticker-inner');
  if (!inner) return;
  const sep = '<span class="ti-sep">◊</span>';
  const doubled = [...tokens, ...tokens].map(t =>
    `<div class="ti"><span class="ti-n">$${esc(t.ticker)}</span> <span class="${t.pct >= 0 ? 'up-c' : 'dn-c'}">${t.pct >= 0 ? '+' : ''}${(t.pct || 0).toFixed(1)}%</span></div>`
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
    const prog = Math.min(100, Number(t.prog) || 0);
    return `<div class="ccard" data-k="${k}" onclick="window._app.openDet('${t.id}')">
      <div class="cc-top">
        ${tokenAvatar({ imageUrl: t.imageUrl, mint: t.mint, ticker: t.tk })}
        <div class="cc-id"><b>${esc(t.n)}</b><span>$${esc(t.tk)}</span></div>
        <span class="cc-rank">#${String(i + 1).padStart(2, '0')}</span>
      </div>
      <div class="cc-mc">${fm(t.mc || 0)}${pctChip(t.pct)}</div>
      <div class="cc-foot">
        <span>Vol 24h <b>${fm(t.vol || 0)}</b></span>
        <span>${k === 'migrated' ? 'Graduated' : `${fmtProg(prog)} curve`}</span>
      </div>
      ${k === 'migrated' ? '' : `<div class="cc-track"><span style="width:${prog}%"></span><i style="left:${prog}%"></i></div>`}
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
const fmtProg = (p) => `${(Number(p) || 0).toFixed(Number(p) >= 10 || !Number(p) ? 0 : 1)}%`;
function pctChip(p) {
  const v = Number(p) || 0;
  if (Math.abs(v) < 0.05) return '';
  return `<span class="pct-chip ${v > 0 ? 'up' : 'dn'}">${v > 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%</span>`;
}
function buildRow(t) {
  const prog = Math.min(100, Number(t.prog) || 0);
  const age = t.createdAt ? fAge(t.createdAt) : (t.age || '—');
  const isCreator = isConnected() && getPublicKey()?.toBase58() === t.creator;
  const creatorBtns = isCreator ? `
    <button class="tr-mini" onclick="event.stopPropagation();window._app.openEditToken('${t.id}')"><iconify-icon icon="solar:pen-linear"></iconify-icon>Edit</button>
    ${t.mode === 'presale' ? `<button class="tr-mini" onclick="event.stopPropagation();window._app.claimCreatorForToken('${t.id}', this)"><iconify-icon icon="solar:gift-linear"></iconify-icon>Claim</button>` : ''}` : '';
  return `<div class="tr" onclick="window._app.openDet('${t.id}')">
    ${tokenAvatar({ imageUrl: t.imageUrl, mint: t.mint, ticker: t.tk })}
    <div class="tr-body">
      <div class="tr-line">
        <span class="tr-name">${esc(t.n)}</span>
        <span class="tr-tk">$${esc(t.tk)}</span>
        ${creatorBtns}
        <span class="tr-mc">${fm(t.mc || 0)}</span>
      </div>
      <div class="tr-line tr-meta">
        <span>${age}</span><span>·</span><span>${fh(t.h || 0)} holders</span><span>·</span><span>vol ${fm(t.vol || 0)}</span>
        ${pctChip(t.pct)}
      </div>
      ${t.col === 'migrated' ? '' : `<div class="tr-prog"><div class="tr-track"><span style="width:${prog}%"></span></div><b>${fmtProg(prog)}</b></div>`}
    </div>
  </div>`;
}

function renderCol(col) {
  let list = getTokens().filter(t => t.col === col);
  if (searchQ) list = list.filter(t => (t.n || '').toLowerCase().includes(searchQ) || (t.tk || '').toLowerCase().includes(searchQ));
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
  const id = document.getElementById('edit-id').value;
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
    el.innerHTML = tokenList.map(t => `<option value="${esc(t.mint)}" ${i === 0 && t.symbol === 'SOL' ? 'selected' : i === 1 && t.symbol === 'BONK' ? 'selected' : ''}>${esc(t.symbol)}</option>`).join('');
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
 ids.forEach(id => document.getElementById(id).style.display = 'block');
}
function stepUI(a) { for (let i = 1; i <= 4; i++) { const el = document.getElementById('s' + i); el.classList.toggle('on', i === a); el.classList.toggle('done', i < a); } }
export async function openLaunch() {
  if (!isConnected()) {
    showN('Connect wallet to launch a token');
    await walletClick();
    if (!isConnected()) return;
  }
  document.getElementById('lm').classList.add('open');
  goStep1();
}
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
      presaleMode: presaleM,
    });
    stepUI(4); showOnly('lsuccess');
    document.getElementById('suc-sub').textContent = `// $${fData.tick} is live · ${result.mint.slice(0, 8)}...`;
    document.getElementById('suc-sig').href = solscanTxUrl(result.poolSig || result.sig);
    showTxN('Launchpad pool created', result.poolSig || result.sig);
    renderAll(); refreshTicker();
  } catch (err) {
    showN('Launch failed: ' + err.message); console.error(err);
    if (btn) { btn.disabled = false; btn.textContent = 'Launch'; }
  }
}

export async function claimCreatorForToken(id, btn) {
  const t = getToken(Number(id));
  if (!t?.mint) return showN('Token not found');
  if (t.mode !== 'presale') return showN('Creator token claims apply to presale pools');
  if (!isConnected()) return showN('Connect wallet first');
  const old = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = 'Claiming...'; }
  try {
    const sig = await claimCreatorTokens(getAnchorWallet(), t.mint);
    showTxN('Creator claim confirmed', sig);
  } catch (err) {
    showN('Creator claim failed: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = old; }
  }
}

export async function migrateToken(id, btn) {
  showN('Migration coming after Meteora integration');
}

export async function claimFeesForToken(id, btn) {
  showN('Fee claims coming after Meteora integration');
}

function buildForm(mode) {
  const bc = mode === 'bonding';
  document.getElementById('lfc').innerHTML = `
    <div class="igrid">
      <div class="igr"><span class="igk">Migration</span><span class="igv">${bc ? '100 SOL' : '100-10K SOL'}</span></div>
      <div class="igr"><span class="igk">Max Wallet</span><span class="igv">1%</span></div>
      <div class="igr"><span class="igk">Buy Fee</span><span class="igv">1%</span></div>
      <div class="igr"><span class="igk">Sell</span><span class="igv">${bc ? '24% → buyback' : 'After graduation'}</span></div>
    </div>
${bc ? '' : `
    <div class="fstit">Buyback schedule after graduation</div>
    <div class="frow">
      <div class="ff" style="cursor:pointer;" id="pm-reg" onclick="window._app.selPresaleMode(0)">
        <div class="pm-card">
          <div class="pm-name">Regular</div>
<div class="pm-desc">6 burns × 10% · every 4h<br>Steady, over 24 hours</div>        </div>
      </div>
      <div class="ff" style="cursor:pointer;" id="pm-ext" onclick="window._app.selPresaleMode(1)">
        <div class="pm-card">
          <div class="pm-name">Extreme</div>
<div class="pm-desc">12 burns × 5% · every 30 min<br>Fast, over 6 hours</div>        </div>
      </div>
    </div>
    `}
    <div class="fstit">Identity</div>    <div class="frow">
      <div class="ff"><label class="fl">Name *</label><input class="fi" id="f-name" placeholder="Red Carpet Inu" maxlength="32"></div>
      <div class="ff"><label class="fl">Ticker *</label><input class="fi" id="f-tick" placeholder="RCINU" maxlength="8" style="text-transform:uppercase"></div>
    </div>
    <div class="ff"><label class="fl">Description</label><textarea class="fta" id="f-desc" placeholder="Tell your story..."></textarea></div>
    <div class="fstit">Media</div>
    <div class="frow">
      <div class="ff">
        <label class="fl">Token Image</label>
        <label class="up-drop" id="img-label" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--red-bdr)'">
          <iconify-icon icon="solar:gallery-add-linear"></iconify-icon>
          <span id="img-label-txt">Upload image · PNG, JPG, GIF, WEBP · max 4 MB</span>
          <input type="file" id="f-img" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;" onchange="window._app.previewImage(this)">
        </label>
        <div id="img-preview" style="display:none;margin-top:8px;"><img id="img-prev-el" class="up-prev" alt="preview"></div>
      </div>
      <div class="ff"><label class="fl">Website</label><input class="fi" id="f-web" placeholder="https://..."></div>
    </div>
    <div class="fstit">Socials</div>
    <div class="frow">
      <div class="ff"><label class="fl">Twitter</label><input class="fi" id="f-twt" placeholder="@handle"></div>
      <div class="ff"><label class="fl">Telegram</label><input class="fi" id="f-tg" placeholder="t.me/..."></div>
    </div>`;
}

export function selPresaleMode(m) {
  presaleM = m;
  document.querySelector('#pm-reg .pm-card')?.classList.toggle('sel', m === 0);
  document.querySelector('#pm-ext .pm-card')?.classList.toggle('sel', m === 1);
}
export function previewImage(input) {
  const file = input.files[0]; if (!file) return;
  const url = URL.createObjectURL(file);
  document.getElementById('img-prev-el').src = url;
  document.getElementById('img-preview').style.display = 'block';
  document.getElementById('img-label-txt').textContent = file.name;
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
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
// Pull every launched token from the indexer so the feed isn't limited to
// tokens this browser created. Silent when the API is down.
const INDEX_SYNC_MS = 30_000;
async function syncIndexedTokens() {
  try {
    const res = await fetch(`${CONFIG.apiUrl}/tokens?limit=100`);
    if (!res.ok) throw new Error(`indexer ${res.status}`);
    const { tokens } = await res.json();
    mergeIndexedTokens(tokens);
  } catch {
    // Indexer offline — read pools straight from the program instead.
    try {
      const { fetchChainTokens } = await import('./chain-feed.js');
      mergeIndexedTokens(await fetchChainTokens());
    } catch (err) {
      console.warn('[feed] chain fallback failed', err);
    }
  }
}
window.addEventListener('platform:tokens-synced', () => { renderAll(); refreshTicker(); });

// Open any token by mint — from pages, share links or search.
export function openToken(mint) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) { showN('Invalid token link'); return; }
  if (!getTokens().some(t => t.mint === mint)) {
    mergeIndexedTokens([{ mint, ticker: mint.slice(0, 4).toUpperCase(), name: `Token ${mint.slice(0, 6)}` }]);
  }
  const token = getTokens().find(t => t.mint === mint);
  if (token) openDet(token.id);
}

// Mobile: the bottom bar holds Home / Red Carpet / Launch / Furnace / More;
// "More" opens a sheet with the rest of the sidebar.
export function toggleMoreSheet() {
  const sheet = document.getElementById('more-sheet');
  if (!sheet) return;
  if (!sheet.hidden) { closeMoreSheet(); return; }
  const items = [...document.querySelectorAll('#sb .sbi-more')]
    .map(el => el.classList.contains('sb-sec') ? `<div class="ms-sec">${el.textContent}</div>` : el.outerHTML.replace('sbi sbi-more', 'ms-item'))
    .join('');
  sheet.innerHTML = `<div class="ms-backdrop" onclick="closeMoreSheet()"></div><div class="ms-panel">${items}</div>`;
  sheet.hidden = false;
}
export function closeMoreSheet() {
  const sheet = document.getElementById('more-sheet');
  if (sheet) { sheet.hidden = true; sheet.innerHTML = ''; }
}

// Landing-page links and share links: ?launch=1, ?token=<mint>, ?view=<page>
function handleDeepLink() {
  const params = new URLSearchParams(location.search);
  const mint = params.get('token');
  if (params.get('view') && PAGE_KEYS.includes(params.get('view'))) {
    setView(params.get('view'));
  } else if (mint) {
    // Opens straight away — the detail page reads what it needs from the chain.
    openToken(mint);
  } else if (params.get('launch') === '1') {
    openLaunch();
  }
}

export function init() {
  startSolPrice();
  window.addEventListener('usd:sol-price', () => { renderAll(); });
  bindPages(document.getElementById('page-view'), openToken);
  renderAll();
  refreshTicker();
  handleDeepLink();
  syncIndexedTokens();
  setInterval(syncIndexedTokens, INDEX_SYNC_MS);
  const netBadge = document.getElementById('net-badge');
  if (netBadge) netBadge.textContent = CONFIG.LAUNCHPAD.cluster.toUpperCase();
  requestAnimationFrame(() => setTimeout(updCrs, 100));

  document.addEventListener('click', e => {
    if (!e.target.closest('#cbtn') && !e.target.closest('#wmenu')) closeWMenu();
  });
  document.querySelectorAll('.ov').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));
  window.addEventListener('resize', () => { updCrs(); });

  // Expose all public functions to window for inline HTML handlers
  window._app = {
    walletClick, disconnectWalletUI, toggleWMenu, closeWMenu, copyAddrUI, openSolscan,
    toggleSb, setView, goProfile,
    openDet, openToken, toggleMoreSheet, closeMoreSheet,
    openEditToken, closeEditToken, saveEditToken,
    openSwap, closeSwap, flipSwap, cswap, doSwap,
    openLaunch, closeLaunch, selMode, selPresaleMode, goStep1, goStep2, goStep2b, goStep3, doLaunch,
    claimCreatorForToken, migrateToken, claimFeesForToken,
    previewImage,
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
   
  // Auto-reconnect: if user previously connected, restore the SAME wallet silently.
  // Phantom/Solflare/Backpack inject providers asynchronously, so retry briefly
  // until at least one is on window.
  (async () => {
    const lastWallet = (() => { try { return localStorage.getItem('carpet:lastWallet'); } catch { return null; } })();
    if (!lastWallet) return;
    for (let i = 0; i < 20; i++) {
      if (getSupportedWallets().length) break;
      await new Promise(r => setTimeout(r, 100));
    }
    try {
      await connectWallet(lastWallet, { onlyIfTrusted: true, silent: true });
    } catch {}
  })();
}

// Expose all public functions to window for inline HTML handlers — at module top-level
// so they're available BEFORE init() runs (prevents "walletClick is not defined" on early clicks)
window._app = {
  walletClick, disconnectWalletUI, toggleWMenu, closeWMenu, copyAddrUI, openSolscan,
  toggleSb, setView, goProfile,
  openDet,
  openEditToken, closeEditToken, saveEditToken,
  openSwap, closeSwap, flipSwap, cswap, doSwap,
  openLaunch, closeLaunch, selMode, selPresaleMode, goStep1, goStep2, goStep2b, goStep3, doLaunch,
  claimCreatorForToken, migrateToken, claimFeesForToken,
  previewImage,
  pfTab,
  cMove, setColSort, filterSearch,
  showN,
  renderProfile, openEditProfile, closeEditProfile,
  uploadProfileAvatar, uploadProfileBanner,
  saveProfile: saveProfileFn, shareProfile,
};
Object.entries(window._app).forEach(([k, v]) => { window[k] = v; });
window.copyAddr = window.copyAddrUI;
init();
