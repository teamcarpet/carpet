import crypto from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { Connection, PublicKey } from '@solana/web3.js';

// Request handlers shared by Vercel Functions (api/*) and the local dev server
// (server/index.js). Every secret (Pinata JWT, LiveKit secret) stays here.
// Web-standard signature: (Request) => Promise<Response>.

const env = (k, d) => process.env[k] || d;
const PINATA_GATEWAY = () => env('PINATA_GATEWAY', 'https://gateway.pinata.cloud');
const PROGRAM_ID = () => new PublicKey(env('PROGRAM_ID', 'DywpVp5YfLiX4M3xfEp333Y2dmq8xywdNAYaWDw6v9XV'));

// Vercel caps request bodies at 4.5 MB.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ── Guards ──────────────────────────────────────────────────────────────────
// Browsers always send Origin on cross-site POSTs; block other sites from
// spending our Pinata quota. Same-origin and server-to-server calls pass.
function checkOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const allowed = env('ALLOWED_ORIGINS', '').split(',').map(s => s.trim()).filter(Boolean);
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  let originHost = '';
  try { originHost = new URL(origin).host; } catch {}
  const vercelPreview = process.env.VERCEL_URL && originHost === process.env.VERCEL_URL;
  if (originHost !== host && !vercelPreview && !allowed.includes(origin)) {
    throw new HttpError(403, 'Origin not allowed');
  }
}

// Best effort per-IP limit. On serverless this is per warm instance only.
const hits = new Map();
function rateLimit(request, bucket, max, windowMs) {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.start > windowMs) {
    if (hits.size > 5000) hits.clear();
    hits.set(key, { start: now, count: 1 });
    return;
  }
  if (++entry.count > max) throw new HttpError(429, 'Too many requests');
}

async function readBody(request, limit) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) throw new HttpError(413, 'File too large');
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > limit) throw new HttpError(413, 'File too large');
  return buf;
}

async function readJson(request, limit) {
  const buf = await readBody(request, limit);
  try { return JSON.parse(buf.toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

function wrap(fn) {
  return async (request) => {
    try {
      if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
      checkOrigin(request);
      return await fn(request);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message });
      console.error('[api]', err);
      return json(500, { error: 'Internal error' });
    }
  };
}

// ── Pinata ──────────────────────────────────────────────────────────────────
const IMAGE_SIGNATURES = [
  { type: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: 'image/webp', ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46], tail: [8, [0x57, 0x45, 0x42, 0x50]] },
];

function sniffImage(buf) {
  return IMAGE_SIGNATURES.find(sig =>
    sig.bytes.every((b, i) => buf[i] === b) &&
    (!sig.tail || sig.tail[1].every((b, i) => buf[sig.tail[0] + i] === b)),
  ) || null;
}

async function pinata(path, init) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new HttpError(503, 'Uploads are not configured');
  const res = await fetch(`https://api.pinata.cloud/pinning/${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    console.error('[pinata]', res.status, await res.text());
    throw new HttpError(502, 'IPFS upload failed');
  }
  const { IpfsHash } = await res.json();
  return { cid: IpfsHash, url: `${PINATA_GATEWAY()}/ipfs/${IpfsHash}`, ipfsUrl: `ipfs://${IpfsHash}` };
}

const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cleanUrl = (v) => {
  const s = cleanText(v, 200);
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch { return ''; }
};
const cleanHandle = (v) => cleanText(v, 200).replace(/[^\w@./:\-]/g, '');

export const uploadImage = wrap(async (request) => {
  rateLimit(request, 'image', 20, 10 * 60 * 1000);
  const buf = await readBody(request, MAX_IMAGE_BYTES);
  if (!buf.length) throw new HttpError(400, 'Empty file');
  const kind = sniffImage(buf);
  if (!kind) throw new HttpError(415, 'Only PNG, JPEG, GIF or WEBP images are allowed');

  const base = cleanText(request.headers.get('x-file-name'), 40).replace(/[^\w\-]/g, '_') || 'image';
  const name = `${base}.${kind.ext}`;
  const form = new FormData();
  form.append('file', new Blob([buf], { type: kind.type }), name);
  form.append('pinataMetadata', JSON.stringify({ name }));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  return json(200, { ...(await pinata('pinFileToIPFS', { method: 'POST', body: form })), type: kind.type });
});

export const uploadMetadata = wrap(async (request) => {
  rateLimit(request, 'meta', 20, 10 * 60 * 1000);
  const b = await readJson(request, 16 * 1024);
  const name = cleanText(b.name, 32);
  const symbol = cleanText(b.symbol, 10).toUpperCase();
  if (!name || !symbol) throw new HttpError(400, 'name and symbol are required');
  const image = /^ipfs:\/\/[a-zA-Z0-9]+$/.test(b.image || '') ? b.image : '';
  const imageType = /^image\/(png|jpeg|gif|webp)$/.test(b.imageType || '') ? b.imageType : 'image/png';
  const twitter = cleanHandle(b.twitter);
  const telegram = cleanHandle(b.telegram);

  const metadata = {
    name,
    symbol,
    description: cleanText(b.description, 500),
    image,
    external_url: cleanUrl(b.website),
    attributes: [],
    properties: { files: image ? [{ uri: image, type: imageType }] : [], category: 'image' },
    extensions: { ...(twitter ? { twitter } : {}), ...(telegram ? { telegram } : {}) },
  };
  return json(200, await pinata('pinJSONToIPFS', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name: `${symbol}_metadata.json` },
      pinataOptions: { cidVersion: 1 },
    }),
  }));
});

// ── LiveKit ─────────────────────────────────────────────────────────────────
function verifyWalletSignature(wallet, message, signatureB64) {
  const pub = new PublicKey(wallet).toBytes();
  const key = crypto.createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(pub).toString('base64url') },
    format: 'jwk',
  });
  return crypto.verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signatureB64, 'base64'));
}

// Both BondingCurvePool and PresalePool start with `creator: Pubkey` after the
// 8-byte Anchor discriminator.
async function poolCreator(mint) {
  const connection = new Connection(env('SOLANA_RPC_URL', 'https://api.devnet.solana.com'), 'confirmed');
  const programId = PROGRAM_ID();
  for (const seed of ['bonding_pool', 'presale_pool']) {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from(seed), mint.toBuffer()], programId);
    const info = await connection.getAccountInfo(pda);
    if (info && info.owner.equals(programId) && info.data.length >= 40) {
      return new PublicKey(info.data.subarray(8, 40));
    }
  }
  return null;
}

export const livekitToken = wrap(async (request) => {
  rateLimit(request, 'livekit', 30, 60 * 1000);
  const apiKey = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !secret) throw new HttpError(503, 'Live streaming is not configured');

  const { roomName, isPublisher, wallet, message, signature } = await readJson(request, 4 * 1024);
  const match = /^carpet-([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(roomName || '');
  if (!match) throw new HttpError(400, 'Invalid room');

  let identity = `viewer-${crypto.randomBytes(6).toString('hex')}`;
  if (isPublisher) {
    if (!wallet || !message || !signature) throw new HttpError(401, 'Wallet signature required');
    const ts = Number(/@ (\d+)$/.exec(message)?.[1]);
    if (message !== `CARPET live: ${roomName} @ ${ts}` || Math.abs(Date.now() - ts) > SIGNATURE_MAX_AGE_MS) {
      throw new HttpError(401, 'Stale or malformed signed message');
    }
    if (!verifyWalletSignature(wallet, message, signature)) throw new HttpError(401, 'Bad signature');
    const creator = await poolCreator(new PublicKey(match[1]));
    if (!creator || creator.toBase58() !== wallet) throw new HttpError(403, 'Only the token creator can go live');
    identity = wallet;
  }

  const at = new AccessToken(apiKey, secret, { identity, ttl: '2h' });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: !!isPublisher,
    canSubscribe: true,
    canPublishData: true,
  });
  return json(200, { token: await at.toJwt(), identity });
});
