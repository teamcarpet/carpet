// Starred tokens, kept in this browser.
const KEY = 'carpet_favs';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]').filter(m => typeof m === 'string'); } catch { return []; }
}

export const getFavorites = () => read();
export const isFavorite = (mint) => read().includes(mint);

export function toggleFavorite(mint) {
  const list = read();
  const next = list.includes(mint) ? list.filter(m => m !== mint) : [mint, ...list].slice(0, 200);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  window.dispatchEvent(new CustomEvent('favorites:changed', { detail: next }));
  return next.includes(mint);
}
