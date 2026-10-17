// Token avatar used everywhere (feed, pages, token header). Tokens without an
// image get a gradient seeded by the mint plus the ticker's first letter, so
// every token looks distinct instead of sharing one placeholder.

import { esc, safeUrl } from './escape.js';

function hueFrom(seed) {
  let h = 0;
  for (const ch of String(seed || 'carpet')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function tokenAvatar({ imageUrl, mint, ticker } = {}, cls = 'tk-av') {
  const url = safeUrl(imageUrl);
  if (url) return `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">`;
  const h = hueFrom(mint || ticker);
  const letter = esc((String(ticker || '?').replace(/^\$/, '')[0] || '?').toUpperCase());
  return `<div class="${cls} tk-av-gen" style="--h1:${h};--h2:${(h + 48) % 360}">${letter}</div>`;
}
