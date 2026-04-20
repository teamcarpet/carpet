// ── src/profile.js ──────────────────────────────────────────────────────────
// Dynamic profile page with avatar + banner editing, persisted to localStorage.

import { getPublicKey, getShortAddress, getBalance, isConnected, onWalletChange } from './wallet.js';
import { getTokens } from './platform.js';

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
export async function renderProfile() {
  const container = document.getElementById('profile-view');
  if (!container) return;

  if (!isConnected()) {
    container.innerHTML = `
      <div style="padding:80px 24px;text-align:center;">
        <iconify-icon icon="solar:wallet-bold-duotone" style="font-size:64px;color:var(--red);margin-bottom:18px;"></iconify-icon>
        <div style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--text);margin-bottom:10px;letter-spacing:3px;text-transform:uppercase;">Connect Wallet</div>
        <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-bottom:24px;letter-spacing:.3px;">Connect to view and edit your profile</div>
        <button class="btn btn-primary btn-lg" onclick="walletClick(event)">
          <iconify-icon icon="solar:wallet-bold" style="font-size:14px;"></iconify-icon> Connect
        </button>
      </div>`;
    return;
  }

  const pk = getPublicKey().toBase58();
  const short = getShortAddress();
  const p = loadProfile(pk);

  // Real data
  let balance = 0;
  try { balance = await getBalance(); } catch {}

  let createdCount = 0;
  try {
    const all = await getTokens();
    createdCount = all.filter(t => t.creator === pk).length;
  } catch {}

  const bannerStyle = p.banner
    ? `background:url('${p.banner}') center/cover,var(--bg-3);`
    : `background:radial-gradient(ellipse at 30% 50%,rgba(255,45,45,.25),transparent 60%),var(--bg-3);`;

  const avatarInner = p.avatar
    ? `<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover;">`
    : `<span style="font-size:40px;">${p.avatarEmoji || DEFAULT_EMOJI}</span>`;

  container.innerHTML = `
    <div style="height:140px;${bannerStyle};position:relative;overflow:hidden;border-bottom:1px solid var(--line);">
      ${p.banner ? '' : '<div style="position:absolute;inset:0;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:32px 32px;opacity:.6;"></div>'}
    </div>

    <div style="padding:0 24px;display:flex;align-items:flex-end;justify-content:space-between;margin-top:-36px;margin-bottom:16px;position:relative;z-index:2;">
      <div style="width:72px;height:72px;border-radius:12px;background:var(--red);display:flex;align-items:center;justify-content:center;border:3px solid var(--bg-2);box-shadow:0 0 24px var(--red-glow);overflow:hidden;">${avatarInner}</div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" onclick="_app.shareProfile()">
          <iconify-icon icon="solar:share-bold" style="font-size:13px;"></iconify-icon> Share
        </button>
        <button class="btn btn-primary btn-sm" onclick="_app.openEditProfile()">
          <iconify-icon icon="solar:pen-bold" style="font-size:13px;"></iconify-icon> Edit
        </button>
      </div>
    </div>

    <div style="padding:0 24px 18px;border-bottom:1px solid var(--line);">
      <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:var(--text);letter-spacing:2px;margin-bottom:8px;text-transform:uppercase;">${escapeHTML(p.username)}</div>
      <div style="display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;color:var(--text);background:var(--surface);border:1px solid var(--line);padding:6px 12px;border-radius:5px;cursor:pointer;margin-bottom:12px;letter-spacing:.5px;" onclick="_app.copyAddrUI()">
        ${short}
        <iconify-icon icon="solar:copy-bold" style="font-size:11px;opacity:.6;"></iconify-icon>
      </div>
      <div style="font-family:var(--mono);font-size:11.5px;color:var(--muted);line-height:1.7;max-width:600px;margin-bottom:14px;letter-spacing:.3px;white-space:pre-wrap;">${
        p.bio
          ? escapeHTML(p.bio)
          : '<span style="color:var(--dim);font-style:italic;">No bio yet. Click Edit to add one.</span>'
      }</div>
      <div style="display:flex;gap:26px;">
        <div><div style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--text);">${balance.toFixed(3)}</div><div style="font-family:var(--mono);font-size:9.5px;color:var(--dim);letter-spacing:1.5px;margin-top:3px;text-transform:uppercase;">SOL Balance</div></div>
        <div><div style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--red);">${createdCount}</div><div style="font-family:var(--mono);font-size:9.5px;color:var(--dim);letter-spacing:1.5px;margin-top:3px;text-transform:uppercase;">Tokens Created</div></div>
      </div>
    </div>

    <div style="display:flex;padding:0 24px;border-bottom:1px solid var(--line);margin-bottom:18px;gap:0;">
      <div class="pf-tab on" onclick="pfTab(this,'balances')">Balances</div>
      <div class="pf-tab" onclick="pfTab(this,'created')">Created</div>
      <div class="pf-tab" onclick="pfTab(this,'activity')">Activity</div>
      <div class="pf-tab" onclick="pfTab(this,'rewards')">Rewards</div>
    </div>
    <div id="pf-content" style="padding:0 24px;"></div>
  `;

  // Populate default tab
  window._app?.pfTab?.(document.querySelector('.pf-tab.on'), 'balances');
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

export function shareProfile() {
  if (!isConnected()) return;
  const pk = getPublicKey().toBase58();
  const url = `${location.origin}/profile/${pk}`;
  navigator.clipboard?.writeText(url);
  window.showN?.('Profile link copied');
}

// ── Init ─────────────────────────────────────────────────────────────────────
export function initProfile() {
  onWalletChange(() => {
    const v = document.getElementById('profile-view');
    if (v && getComputedStyle(v).display !== 'none') renderProfile();
  });
}
