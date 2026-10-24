// ─────────────────────────────────────────────────────────────────────────
// Graduated tokens trade on Meteora DAMM v2, which this indexer doesn't
// decode trade-by-trade. Every PRICE_POLL_MS we read each graduated pool's
// two vaults and the token's live supply (buybacks burn it) and refresh
// pool_state price / market cap / reserves, so the feed doesn't freeze at
// the curve's last price.
// Pools are seeded full-range, so the vault ratio tracks the pool price.
// ─────────────────────────────────────────────────────────────────────────

import { Connection, PublicKey } from '@solana/web3.js';
import { sql } from '@carpet/shared/db';
import { logger } from '@carpet/shared';

const CP_AMM = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG');
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
const PRICE_POLL_MS = Number(process.env.PRICE_POLL_MS || 30_000);

const vault = (mint: PublicKey, pool: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('token_vault'), mint.toBuffer(), pool.toBuffer()], CP_AMM)[0];

async function refreshOnce(connection: Connection): Promise<void> {
  const rows = await sql<{ mint: string; meteora_pool: string }[]>`
    SELECT mint, meteora_pool FROM tokens WHERE is_migrated = true AND meteora_pool IS NOT NULL`;
  for (const r of rows) {
    try {
      const mint = new PublicKey(r.mint), pool = new PublicKey(r.meteora_pool);
      const [solBal, tokBal, supply] = await Promise.all([
        connection.getTokenAccountBalance(vault(WSOL, pool)),
        connection.getTokenAccountBalance(vault(mint, pool)),
        connection.getTokenSupply(mint),
      ]);
      const sol = Number(solBal.value.uiAmount) || 0;
      const tok = Number(tokBal.value.uiAmount) || 0;
      if (!sol || !tok) continue;
      const priceSol = sol / tok;
      const totalSupply = Number(supply.value.uiAmount) || 0;
      await sql`
        UPDATE pool_state
        SET price_sol = ${priceSol},
            market_cap = ${priceSol * totalSupply},
            reserve_sol = ${sol},
            reserve_token = ${tok},
            last_updated = NOW()
        WHERE mint = ${r.mint}`;
      await sql`UPDATE tokens SET ath = GREATEST(coalesce(ath, 0), ${priceSol * totalSupply}) WHERE mint = ${r.mint}`;
    } catch (err) {
      logger.debug({ err, mint: r.mint.slice(0, 8) }, 'meteora price refresh failed');
    }
  }
}

export function startMeteoraPriceRefresher(connection: Connection): void {
  const tick = () => void refreshOnce(connection).catch((err) => logger.warn({ err }, 'meteora price tick failed'));
  setTimeout(tick, 15_000);
  setInterval(tick, PRICE_POLL_MS).unref();
}
