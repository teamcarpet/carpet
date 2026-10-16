import { CONFIG } from '../src/config.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Background: dot-matrix red carpet rolling toward the viewer ─────────────
function startCarpet(canvas) {
  const ctx = canvas.getContext('2d');
  const ROWS = 46;
  const COLS = 37;           // odd, so there's a centre column
  const CARPET_HALF = 4.5;   // columns either side of centre that form the carpet
  const SPACING = 1;
  const DEPTH = ROWS * SPACING;
  const SPEED = 1.2;         // world units per second
  let w = 0, h = 0, dpr = 1, raf = 0, last = 0, offset = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spotlight(x, sway, t) {
    const topX = x + Math.sin(t * 0.25 + sway) * w * 0.03;
    const g = ctx.createRadialGradient(topX, -h * 0.05, 0, topX, -h * 0.05, h * 0.9);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(topX - w * 0.02, 0);
    ctx.lineTo(topX + w * 0.02, 0);
    ctx.lineTo(w / 2 + (topX - w / 2) * 0.15 + w * 0.16, h);
    ctx.lineTo(w / 2 + (topX - w / 2) * 0.15 - w * 0.16, h);
    ctx.closePath();
    ctx.fill();
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const horizon = h * 0.5;
    const focal = Math.max(w, h) * 0.55;
    const camH = 1.6;

    // warm glow where the carpet meets the horizon
    const glow = ctx.createRadialGradient(cx, horizon, 0, cx, horizon, w * 0.45);
    glow.addColorStop(0, 'rgba(255,45,45,0.22)');
    glow.addColorStop(1, 'rgba(255,45,45,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    spotlight(w * 0.22, 0, t);
    spotlight(w * 0.78, 2, t);

    for (let r = 0; r < ROWS; r++) {
      const z = ((r * SPACING - offset) % DEPTH + DEPTH) % DEPTH + 0.6;
      const y = horizon + (camH / z) * focal;
      if (y > h + 10) continue;
      const fade = Math.min(1, (DEPTH - z) / (DEPTH * 0.5));
      for (let c = 0; c < COLS; c++) {
        const xw = (c - (COLS - 1) / 2) * 0.62;
        const x = cx + (xw / z) * focal;
        if (x < -10 || x > w + 10) continue;
        const onCarpet = Math.abs(c - (COLS - 1) / 2) <= CARPET_HALF;
        const size = Math.max(0.7, 4.6 / z * (onCarpet ? 1.2 : 0.9));
        const alpha = fade * (onCarpet ? 1 : 0.28);
        ctx.fillStyle = onCarpet ? `rgba(255,45,45,${alpha})` : `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function frame(now) {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    offset = (offset + dt * SPEED) % DEPTH;
    draw(now / 1000);
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', () => { resize(); if (reducedMotion) draw(0); });
  if (reducedMotion) { draw(0); return; }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  });
  raf = requestAnimationFrame(frame);
}

// ── Mobile menu ─────────────────────────────────────────────────────────────
function setupMenu() {
  const burger = document.getElementById('burger');
  const menu = document.getElementById('mobile-menu');
  const overlay = document.getElementById('menu-overlay');
  if (!burger || !menu || !overlay) return;

  const setOpen = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
    overlay.hidden = !open;
    document.body.classList.toggle('menu-open', open);
  };

  burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
  overlay.addEventListener('click', () => setOpen(false));
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  window.addEventListener('resize', () => { if (window.innerWidth > 720) setOpen(false); });
}

// ── Live stats from the launchpad program ──────────────────────────────────
// BondingCurvePool layout (after the 8-byte discriminator):
//   creator 32 · mint 32 · virtual_sol 8 · virtual_tokens 8 · real_sol 8 @88 ·
//   real_tokens 8 · initial_tokens 8 · migration_target 8 · max_buy_bps 2 ·
//   buyback_treasury 8 · is_migrated 1 @130
const REAL_SOL_OFFSET = 88;
const SLICE_LEN = 43;
const MIGRATED_IN_SLICE = 130 - REAL_SOL_OFFSET;

async function discriminator(name) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`account:${name}`));
  return btoa(String.fromCharCode(...new Uint8Array(hash).slice(0, 8)));
}

async function rpc(method, params) {
  const res = await fetch(CONFIG.solanaRpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function programAccounts(accountName, dataSlice) {
  return rpc('getProgramAccounts', [
    CONFIG.LAUNCHPAD.programId,
    {
      encoding: 'base64',
      dataSlice,
      filters: [{ memcmp: { offset: 0, bytes: await discriminator(accountName), encoding: 'base64' } }],
    },
  ]);
}

function readU64(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true);
}

async function loadStats() {
  const [bonding, presale] = await Promise.all([
    programAccounts('BondingCurvePool', { offset: REAL_SOL_OFFSET, length: SLICE_LEN }),
    programAccounts('PresalePool', { offset: 0, length: 0 }),
  ]);
  let raisedLamports = 0n;
  let graduated = 0;
  for (const { account } of bonding) {
    const bytes = Uint8Array.from(atob(account.data[0]), ch => ch.charCodeAt(0));
    if (bytes.length < SLICE_LEN) continue;
    raisedLamports += readU64(bytes, 0);
    if (bytes[MIGRATED_IN_SLICE]) graduated++;
  }
  return {
    launched: bonding.length + presale.length,
    raised: Number(raisedLamports) / 1e9,
    graduated,
  };
}

// ── Count-up ────────────────────────────────────────────────────────────────
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function format(value, decimals) {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function countUp(el, target, i) {
  const decimals = Number(el.dataset.decimals || 0);
  const suffix = el.dataset.suffix || '';
  // rAF doesn't run in background tabs — show the final number instead of a frozen dash.
  if (reducedMotion || document.hidden) { el.textContent = format(target, decimals) + suffix; return; }
  const duration = 1500 + i * 80;
  setTimeout(() => {
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      el.textContent = format(target * easeOutCubic(p), decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, 480 + i * 90);
}

function setupStats() {
  const els = [...document.querySelectorAll('.stat-value')];
  const statsPromise = loadStats().catch((err) => {
    console.warn('[landing] stats unavailable', err);
    return null;
  });

  let started = false;
  const run = async () => {
    if (started) return;
    started = true;
    const stats = await statsPromise;
    els.forEach((el, i) => {
      const target = el.dataset.stat ? stats?.[el.dataset.stat] : Number(el.dataset.target);
      if (typeof target === 'number' && Number.isFinite(target)) countUp(el, target, i);
    });
  };

  const section = document.querySelector('.stats');
  if (!('IntersectionObserver' in window) || !section) { run(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) { io.disconnect(); run(); }
  }, { threshold: 0.25 });
  io.observe(section);
  setTimeout(run, 2500); // in case the observer never fires (hidden tab, odd layouts)
}

startCarpet(document.getElementById('bg-canvas'));
setupMenu();
setupStats();
