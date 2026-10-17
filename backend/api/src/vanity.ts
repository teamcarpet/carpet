// Vanity mint pool: keeps a stock of keypairs whose base58 address ends with
// VANITY_SUFFIX and hands one out per launch (POST /vanity-mint).
//
// Grinding runs in a worker thread so the API stays responsive. The last k
// base58 characters of an address are just its value mod 58^k, so a candidate
// is checked with one BigInt modulo instead of a full base58 encode.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { FastifyPluginAsync } from 'fastify';
import { logger } from '@carpet/shared';
import { sql } from '@carpet/shared/db';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const SUFFIX = process.env.VANITY_SUFFIX || 'rug';
const TARGET_STOCK = Number(process.env.VANITY_STOCK || 40);
const BATCH = 5;

function suffixTarget(suffix: string): { mod: bigint; rem: bigint } {
  let rem = 0n;
  for (const ch of suffix) {
    const d = ALPHABET.indexOf(ch);
    if (d < 0) throw new Error(`Invalid base58 suffix: ${suffix}`);
    rem = rem * 58n + BigInt(d);
  }
  return { mod: 58n ** BigInt(suffix.length), rem };
}

function encodeBase58(bytes: Uint8Array): string {
  let n = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  let out = '';
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = '1' + out; }
  return out;
}

// Raw 32-byte seed / public key out of Node's DER-encoded ed25519 keys.
function grindOne(mod: bigint, rem: bigint): { pubkey: string; secret: Buffer } {
  for (;;) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
    if (BigInt('0x' + pub.toString('hex')) % mod !== rem) continue;
    const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
    return { pubkey: encodeBase58(pub), secret: Buffer.concat([seed, pub]) };
  }
}

if (!isMainThread && workerData?.vanity) {
  const { mod, rem } = suffixTarget(workerData.suffix);
  for (let i = 0; i < workerData.count; i++) {
    const k = grindOne(mod, rem);
    parentPort!.postMessage({ pubkey: k.pubkey, secret: k.secret.toString('base64') });
  }
}

let grinding = false;
async function topUp(): Promise<void> {
  if (grinding) return;
  const [row] = await sql<{ free: number }[]>`
    SELECT count(*)::int AS free FROM vanity_mints WHERE suffix = ${SUFFIX} AND claimed_at IS NULL`;
  if ((row?.free ?? 0) >= TARGET_STOCK) return;
  grinding = true;
  const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { vanity: true, suffix: SUFFIX, count: BATCH } });
  worker.on('message', async (k: { pubkey: string; secret: string }) => {
    try {
      await sql`INSERT INTO vanity_mints (pubkey, secret, suffix)
                VALUES (${k.pubkey}, ${Buffer.from(k.secret, 'base64')}, ${SUFFIX}) ON CONFLICT DO NOTHING`;
    } catch (err) { logger.warn({ err }, 'vanity insert failed'); }
  });
  worker.on('error', (err) => { logger.warn({ err }, 'vanity worker failed'); grinding = false; });
  worker.on('exit', () => { grinding = false; void topUp().catch(() => {}); });
}

export const vanityRoutes: FastifyPluginAsync = async (app) => {
  // Check the stock shortly after boot and then every few minutes (also covers
  // the API starting before the indexer has applied the migration).
  const check = () => void topUp().catch((err) => logger.warn({ err }, 'vanity top-up failed'));
  setTimeout(check, 5_000);
  setInterval(check, 5 * 60_000).unref();

  // Atomically claims one unused keypair. 404 when the stock is empty — the
  // frontend then falls back to a random mint, so launches never wait on this.
  app.post('/vanity-mint', { config: { rateLimit: { max: 10, timeWindow: 10 * 60_000 } } }, async (_req, reply) => {
    const rows = await sql<{ pubkey: string; secret: Buffer }[]>`
      UPDATE vanity_mints SET claimed_at = NOW()
      WHERE pubkey = (
        SELECT pubkey FROM vanity_mints
        WHERE suffix = ${SUFFIX} AND claimed_at IS NULL
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING pubkey, secret`;
    void topUp().catch(() => {});
    reply.header('Cache-Control', 'no-store');
    const hit = rows[0];
    if (!hit) { reply.code(404); return { error: 'No vanity mints available' }; }
    return { pubkey: hit.pubkey, secretKey: Buffer.from(hit.secret).toString('base64') };
  });
};
