// ─────────────────────────────────────────────────────────────────────────
// Holder counts: every SPL token account for the mint with a non-zero
// balance, minus accounts owned by PDAs (bonding vault, buyback vault,
// Meteora vaults) — those are programs, not people.
// ─────────────────────────────────────────────────────────────────────────

import { Connection, PublicKey } from '@solana/web3.js';
import { sql } from '@carpet/shared/db';
import { logger } from '@carpet/shared';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export async function countHolders(connection: Connection, mint: string): Promise<number> {
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    commitment: 'confirmed',
    // owner (32 bytes @32) + amount (u64 @64)
    dataSlice: { offset: 32, length: 40 },
    filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
  });
  let holders = 0;
  for (const { account } of accounts) {
    const data = account.data;
    if (data.length < 40 || data.readBigUInt64LE(32) === 0n) continue;
    if (!PublicKey.isOnCurve(data.subarray(0, 32))) continue;
    holders++;
  }
  return holders;
}

export function startHolderRefresher(connection: Connection, intervalMs = 120_000): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // Most recently active first; tokens nobody touched in a week can wait.
      const tokens = await sql`
        SELECT t.mint FROM tokens t
        LEFT JOIN pool_state ps ON ps.mint = t.mint
        WHERE t.holders_updated_at IS NULL OR ps.last_updated > t.holders_updated_at
           OR t.holders_updated_at < NOW() - INTERVAL '1 hour'
        ORDER BY ps.last_updated DESC NULLS LAST
        LIMIT 50
      `;
      for (const { mint } of tokens) {
        try {
          const holders = await countHolders(connection, mint);
          await sql`UPDATE tokens SET holders = ${holders}, holders_updated_at = NOW() WHERE mint = ${mint}`;
        } catch (err) {
          logger.debug({ mint: String(mint).slice(0, 8), err: (err as Error).message }, 'holder count failed');
        }
        await new Promise(r => setTimeout(r, 250));
      }
    } finally {
      running = false;
    }
  };
  setInterval(() => { void tick().catch(() => {}); }, intervalMs);
  setTimeout(() => { void tick().catch(() => {}); }, 5_000);
}
