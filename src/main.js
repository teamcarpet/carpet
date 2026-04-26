import {
  connectWallet, disconnectWallet, isConnected,
  getPublicKey, getBalance, getShortAddress,
  copyAddress, refreshBalance, onWalletChange,
} from './wallet.js';
import { buyTokens, sellTokens } from './launchpad.js';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getQuote, executeSwap, searchTokens, getTokenInfo,
  formatAmount, toRawAmount,
} from './jupiter.js';
import { uploadFileToPinata, uploadTokenMetadata } from './ipfs.js';
import {
  getTokens, getToken, addToken, updateToken, deleteToken,
  getTickerTokens,
} from './platform.js';
import { CONFIG } from './config.js';
import {
     renderProfile, openEditProfile, closeEditProfile,
     uploadProfileAvatar, uploadProfileBanner,
     saveProfile as saveProfileFn, shareProfile,
     initProfile,
   } from './profile.js';

import { mountBubbleView, unmountBubbleView } from './bubble/bubble.js';

import { mountTokenDetail, unmountTokenDetail } from './token-detail/token-detail.js';
   

// ── Globals ──────────────────────────────────────────────────────────────────
let sbOpen = false;
let ci = 0; const CV = 3;
const colSort = { new: 'date', bonding: 'prog', migrated: 'date' };
let searchQ = '';
let swapTokenIn = null, swapTokenOut = null;
let swapQuote = null;
let imageFileGlobal = null;
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
  // Hide token detail mount (used by openDet) when switching to a top-level view
  const tdMount = document.getElementById('td-mount');
  if (tdMount) tdMount.style.display = 'none';
  // Also unmount the token detail to clean up its WS / fetchers
  try { unmountTokenDetail(); } catch {}

  ['home', 'bubble', 'profile'].forEach(id => {
    const el = document.getElementById(id + '-view');
    if (el) el.style.display = id === v ? 'flex' : 'none';
    const sbi = document.getElementById('si-' + id);
    if (sbi) sbi.classList.toggle('on', id === v);
  });
  if (v === 'home') setTimeout(updCrs, 60);
   if (v === 'bubble') {
    mountBubbleView(document.getElementById('bubble-view'));
  } else {
    // Only unmount if we're actually leaving bubble
    const bv = document.getElementById('bubble-view');
    if (bv && bv.classList.contains('bm-root')) unmountBubbleView();
  }
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
  ['home', 'bubble', 'profile'].forEach(v => {
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
      // Wire into existing doTrade logic.
      // You may need to adapt depending on how doTrade is structured in your main.js.
      if (!isConnected()) {
        showN('Connect wallet first');
        return;
      }
      try {
        const provider = window.phantom?.solana || window.solana;
        const wallet = {
          publicKey: getPublicKey(),
          signTransaction:    (tx) => provider.signTransaction(tx),
          signAllTransactions:(txs) => provider.signAllTransactions(txs),
        };
        if (side === 'buy') {
          const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
          const sig = await buyTokens(wallet, mint, lamports);
          showN(`✓ Bought · ${sig.slice(0, 8)}…`);
        } else {
          const decimals = token.decimals || 6;
          const tokenAmount = Math.floor(amount * Math.pow(10, decimals));
          const sig = await sellTokens(wallet, mint, tokenAmount);
          showN(`✓ Sold · ${sig.slice(0, 8)}…`);
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
 ids.forEach(id => document.getElementById(id).style.display = 'block');
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
    </div>`;
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
export function init() {
  renderAll();
  refreshTicker();
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
    openDet, 
    openEditToken, closeEditToken, saveEditToken,
    openSwap, closeSwap, flipSwap, cswap, doSwap,
    openLaunch, closeLaunch, selMode, goStep1, goStep2, goStep2b, goStep3, doLaunch,
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
   
  // Auto-reconnect if previously connected
  const provider = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
  if (provider) {
    provider.connect({ onlyIfTrusted: true })
      .then(() => {})
      .catch(() => {});
  }
}

init();
