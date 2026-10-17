// SOL → USD for display. Launchpad users read market caps in dollars
// ("$2.93K", "$23.4K"); on-chain values stay in SOL everywhere else.

const SOL_PRICE_URL = 'https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112';
const REFRESH_MS = 60_000;

let solUsd = null;
let loading = null;

async function load() {
  try {
    const data = await (await fetch(SOL_PRICE_URL)).json();
    const usd = Number(Object.values(data)[0]?.usdPrice);
    if (Number.isFinite(usd) && usd > 0) {
      const changed = usd !== solUsd;
      solUsd = usd;
      if (changed) window.dispatchEvent(new CustomEvent('usd:sol-price', { detail: usd }));
    }
  } catch { /* keep the last known price */ }
}

export function startSolPrice() {
  if (!loading) {
    loading = load();
    setInterval(load, REFRESH_MS);
  }
  return loading;
}

export const getSolUsd = () => solUsd;

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';

/** $980 · $2.93K · $23.4K · $234K · $1.25M · $12.5M */
export function fmtUsdCompact(usd) {
  if (!Number.isFinite(usd)) return '—';
  const abs = Math.abs(usd);
  if (abs === 0) return '$0';
  const unit = (v, suffix) => {
    const d = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `$${v.toFixed(d)}${suffix}`;
  };
  if (abs >= 1e9) return unit(usd / 1e9, 'B');
  if (abs >= 1e6) return unit(usd / 1e6, 'M');
  if (abs >= 1e3) return unit(usd / 1e3, 'K');
  if (abs >= 1) return `$${usd.toFixed(abs >= 100 ? 0 : 2)}`;
  return `$${usd.toPrecision(2)}`;
}

/** Tiny prices: $0.0₅4270 instead of $0.000004270. */
export function fmtUsdPrice(usd) {
  if (!Number.isFinite(usd) || usd <= 0) return '—';
  if (usd >= 1) return `$${usd.toFixed(usd >= 100 ? 2 : 4)}`;
  const exp = Math.floor(Math.log10(usd));
  const zeros = -exp - 1;
  if (zeros < 4) return `$${usd.toFixed(zeros + 4)}`;
  const digits = String(Math.round(usd * 10 ** (-exp + 3))).slice(0, 4);
  return `$0.0${String(zeros).split('').map(d => SUBSCRIPT[d]).join('')}${digits}`;
}

/** A SOL amount as compact USD when the SOL price is known, else as SOL. */
export function fmtSolAsUsd(sol) {
  if (!Number.isFinite(sol)) return '—';
  if (solUsd) return fmtUsdCompact(sol * solUsd);
  return `${sol >= 100 ? sol.toFixed(0) : sol.toFixed(2)} SOL`;
}
