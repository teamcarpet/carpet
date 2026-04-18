// localStorage-based platform data store.
// Replace with a real API/DB backend for production multi-user deployment.

const TOKENS_KEY  = 'carpet_tokens';
const LIVES_KEY   = 'carpet_lives';
const REWARDS_KEY = 'carpet_rewards';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function write(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Tokens ──────────────────────────────────────────────────────────────────

export function getTokens() { return read(TOKENS_KEY); }

export function getToken(id) { return getTokens().find(t => t.id === id) || null; }

export function addToken(token) {
  const tokens = getTokens();
  const entry = {
    ...token,
    id: token.id || Date.now(),
    createdAt: Date.now(),
    col: 'new',
    prog: 0,
    mc: 0,
    vol: 0,
    h: 0,
    pct: 0,
  };
  tokens.unshift(entry);
  write(TOKENS_KEY, tokens);
  window.dispatchEvent(new CustomEvent('platform:token-added', { detail: entry }));
  return entry;
}

export function updateToken(id, updates) {
  const tokens = getTokens();
  const idx = tokens.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tokens[idx] = { ...tokens[idx], ...updates };
  write(TOKENS_KEY, tokens);
  window.dispatchEvent(new CustomEvent('platform:token-updated', { detail: tokens[idx] }));
  return tokens[idx];
}

export function deleteToken(id) {
  const tokens = getTokens().filter(t => t.id !== id);
  write(TOKENS_KEY, tokens);
}

export function getTickerTokens() {
  return getTokens().slice(0, 40).map(t => ({
    name: t.n,
    ticker: t.tk,
    pct: t.pct,
  }));
}

// ── Live streams ─────────────────────────────────────────────────────────────

export function getLives() { return read(LIVES_KEY); }

export function addLive(live) {
  const lives = getLives();
  const entry = {
    ...live,
    id: live.id || Date.now(),
    startedAt: Date.now(),
    viewers: 0,
    active: true,
  };
  lives.unshift(entry);
  write(LIVES_KEY, lives);
  window.dispatchEvent(new CustomEvent('platform:live-added', { detail: entry }));
  return entry;
}

export function updateLive(id, updates) {
  const lives = getLives();
  const idx = lives.findIndex(l => l.id === id);
  if (idx === -1) return null;
  lives[idx] = { ...lives[idx], ...updates };
  write(LIVES_KEY, lives);
  return lives[idx];
}

export function endLive(id) { return updateLive(id, { active: false, endedAt: Date.now() }); }

export function getActiveLives() { return getLives().filter(l => l.active); }

// ── Rewards ──────────────────────────────────────────────────────────────────

export function getRewards() { return read(REWARDS_KEY); }

export function addReward(reward) {
  const rewards = getRewards();
  rewards.unshift({ ...reward, id: reward.id || Date.now(), time: new Date().toISOString() });
  write(REWARDS_KEY, rewards.slice(0, 200));
}
