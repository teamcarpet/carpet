// HTML-escaping helpers. Token names, tickers, descriptions and links come from
// creators, the indexer or localStorage — never put them into innerHTML raw.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, ch => HTML_ESCAPES[ch]);
}

// Only http(s) and ipfs links survive; everything else (javascript:, data:…) becomes ''.
export function safeUrl(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return ['http:', 'https:', 'ipfs:'].includes(u.protocol) ? u.toString() : '';
  } catch { return ''; }
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isBase58Address = (v) => typeof v === 'string' && BASE58.test(v);
