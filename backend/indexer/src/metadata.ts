// ─────────────────────────────────────────────────────────────────────────
// Token metadata: Metaplex on-chain record (name, symbol, uri) plus the
// off-chain JSON it points to (image, description, socials).
// ─────────────────────────────────────────────────────────────────────────

import { Connection, PublicKey } from '@solana/web3.js';
import { sql } from '@carpet/shared/db';
import { logger } from '@carpet/shared';

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const IPFS_GATEWAY = process.env.IPFS_GATEWAY ?? 'https://gateway.pinata.cloud';

export interface TokenMetadata {
  name:        string;
  symbol:      string;
  uri:         string;
  image:       string | null;
  description: string | null;
  website:     string | null;
  twitter:     string | null;
  telegram:    string | null;
}

function metadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  )[0];
}

// Metadata layout: key(1) update_authority(32) mint(32) name(4+N) symbol(4+N) uri(4+N)
function readString(data: Buffer, offset: number): { value: string; next: number } {
  const len = data.readUInt32LE(offset);
  const value = data.subarray(offset + 4, offset + 4 + len).toString('utf8').replace(/\0/g, '').trim();
  return { value, next: offset + 4 + len };
}

export function toHttpUrl(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) return `${IPFS_GATEWAY}/ipfs/${uri.slice(7).replace(/^ipfs\//, '')}`;
  if (/^https?:\/\//.test(uri)) return uri;
  return null;
}

const clean = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

async function fetchJson(url: string, timeoutMs = 8000): Promise<Record<string, any> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json() as Record<string, any>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTokenMetadata(connection: Connection, mint: string): Promise<TokenMetadata | null> {
  const info = await connection.getAccountInfo(metadataPda(new PublicKey(mint)));
  if (!info || info.data.length < 70) return null;

  const name = readString(info.data, 65);
  const symbol = readString(info.data, name.next);
  const uri = readString(info.data, symbol.next);

  const meta: TokenMetadata = {
    name: name.value.slice(0, 32),
    symbol: symbol.value.slice(0, 10),
    uri: uri.value,
    image: null, description: null, website: null, twitter: null, telegram: null,
  };

  const jsonUrl = toHttpUrl(uri.value);
  const json = jsonUrl ? await fetchJson(jsonUrl) : null;
  if (json) {
    meta.image = toHttpUrl(clean(json.image, 300));
    meta.description = clean(json.description, 500);
    meta.website = toHttpUrl(clean(json.external_url, 200));
    meta.twitter = clean(json.extensions?.twitter ?? json.twitter, 200);
    meta.telegram = clean(json.extensions?.telegram ?? json.telegram, 200);
  }
  return meta;
}

export async function saveTokenMetadata(mint: string, meta: TokenMetadata): Promise<void> {
  await sql`
    UPDATE tokens SET
      name         = ${meta.name || sql`name`},
      ticker       = ${meta.symbol || sql`ticker`},
      image_url    = ${meta.image},
      description  = ${meta.description},
      website      = ${meta.website},
      twitter      = ${meta.twitter},
      telegram     = ${meta.telegram},
      metadata_uri = ${meta.uri},
      metadata_ok  = true
    WHERE mint = ${mint}
  `;
}

// Tokens whose metadata wasn't readable at launch (RPC lag, IPFS slow) are
// retried in the background until it shows up.
export function startMetadataRefresher(connection: Connection, intervalMs = 60_000): void {
  const tick = async () => {
    const pending = await sql`SELECT mint FROM tokens WHERE metadata_ok = false ORDER BY created_at DESC LIMIT 25`;
    for (const { mint } of pending) {
      try {
        const meta = await fetchTokenMetadata(connection, mint);
        if (meta) {
          await saveTokenMetadata(mint, meta);
          logger.info({ mint: mint.slice(0, 8), name: meta.name }, 'token metadata resolved');
        }
      } catch (err) {
        logger.debug({ mint: mint.slice(0, 8), err: (err as Error).message }, 'metadata retry failed');
      }
    }
  };
  setInterval(() => { void tick().catch(() => {}); }, intervalMs);
  void tick().catch(() => {});
}
