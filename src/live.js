import {
  Room, RoomEvent, Track, createLocalTracks,
  DataPacket_Kind,
} from 'livekit-client';
import { CONFIG } from './config.js';
import { getPublicKey, signMessageBase64 } from './wallet.js';
import { addLive, updateLive, endLive, getActiveLives } from './platform.js';

let activeRoom = null;
let currentLiveId = null;
const chatListeners = new Set();

// ── Token generation (requires server/index.js to be running) ───────────────

async function getLivekitToken(roomName, isPublisher) {
  const body = { roomName, isPublisher: !!isPublisher };
  if (isPublisher) {
    // Server only grants publish rights to the token creator, proven by signature.
    const message = `CARPET live: ${roomName} @ ${Date.now()}`;
    body.wallet = getPublicKey()?.toBase58();
    body.message = message;
    body.signature = await signMessageBase64(message);
  }
  const res = await fetch(`${CONFIG.appServerUrl}/livekit-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to get LiveKit token');
  return data.token;
}

function parseMessage(data) {
  try { return JSON.parse(new TextDecoder().decode(data)); } catch { return null; }
}

// ── Broadcasting (token creator starts live) ─────────────────────────────────

export async function startLive({ tokenMint, tokenName, tokenTicker }) {
  const pubkey = getPublicKey();
  if (!pubkey) throw new Error('Connect wallet first');
  if (!tokenMint) throw new Error('Live streams are tied to a token');

  const roomName = `carpet-${tokenMint}`;
  const identity = pubkey.toBase58();

  const token = await getLivekitToken(roomName, true);
  const room = new Room({ adaptiveStream: true, dynacast: true });
  activeRoom = room;

  await room.connect(CONFIG.livekitUrl, token);

  const tracks = await createLocalTracks({ audio: true, video: true });
  for (const t of tracks) await room.localParticipant.publishTrack(t);

  const liveEntry = addLive({
    roomName,
    tokenMint,
    tokenName,
    tokenTicker,
    creator: identity,
    creatorShort: `${identity.slice(0, 4)}...${identity.slice(-4)}`,
  });
  currentLiveId = liveEntry.id;

  room.on(RoomEvent.ParticipantConnected, () => {
    const count = room.participants.size + 1;
    updateLive(currentLiveId, { viewers: count });
    window.dispatchEvent(new CustomEvent('live:viewers-update', { detail: { viewers: count } }));
  });
  room.on(RoomEvent.ParticipantDisconnected, () => {
    const count = room.participants.size + 1;
    updateLive(currentLiveId, { viewers: count });
    window.dispatchEvent(new CustomEvent('live:viewers-update', { detail: { viewers: count } }));
  });
  room.on(RoomEvent.DataReceived, (data) => {
    const msg = parseMessage(data);
    if (msg?.type === 'chat' && typeof msg.text === 'string') chatListeners.forEach(fn => fn(msg));
  });

  return { room, liveId: liveEntry.id };
}

export async function stopLive() {
  if (activeRoom) {
    activeRoom.disconnect();
    activeRoom = null;
  }
  if (currentLiveId) endLive(currentLiveId);
  currentLiveId = null;
}

// ── Viewing ──────────────────────────────────────────────────────────────────

export async function joinLive(roomName, videoEl) {
  const token = await getLivekitToken(roomName, false);
  const room = new Room();

  room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
    if (track.kind === Track.Kind.Video) track.attach(videoEl);
  });
  room.on(RoomEvent.DataReceived, (data) => {
    const msg = parseMessage(data);
    if (msg?.type === 'chat' && typeof msg.text === 'string') chatListeners.forEach(fn => fn(msg));
  });

  await room.connect(CONFIG.livekitUrl, token);
  return room;
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export async function sendChatMessage(room, text, displayName) {
  if (!room) return;
  const msg = JSON.stringify({
    type: 'chat',
    text,
    name: displayName || 'Anon',
    ts: Date.now(),
  });
  await room.localParticipant.publishData(
    new TextEncoder().encode(msg),
    { reliable: true, kind: DataPacket_Kind.RELIABLE },
  );
  chatListeners.forEach(fn => fn({ type: 'chat', text, name: displayName || 'You', ts: Date.now(), self: true }));
}

export function onChatMessage(cb) {
  chatListeners.add(cb);
  return () => chatListeners.delete(cb);
}
