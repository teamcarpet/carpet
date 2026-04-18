import {
  Room, RoomEvent, Track, createLocalTracks,
  DataPacket_Kind,
} from 'livekit-client';
import { CONFIG } from './config.js';
import { getPublicKey } from './wallet.js';
import { addLive, updateLive, endLive, getActiveLives } from './platform.js';

let activeRoom = null;
let currentLiveId = null;
const chatListeners = new Set();

// ── Token generation (requires server/index.js to be running) ───────────────

async function getLivekitToken(roomName, identity, isPublisher) {
  const res = await fetch(`${CONFIG.wsServerUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/livekit-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, identity, isPublisher }),
  });
  if (!res.ok) throw new Error('Failed to get LiveKit token');
  const { token } = await res.json();
  return token;
}

// ── Broadcasting (token creator starts live) ─────────────────────────────────

export async function startLive({ tokenMint, tokenName, tokenTicker }) {
  const pubkey = getPublicKey();
  if (!pubkey) throw new Error('Connect wallet first');

  const roomName = `carpet-${tokenMint || Date.now()}`;
  const identity = pubkey.toBase58();

  const token = await getLivekitToken(roomName, identity, true);
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
    const msg = JSON.parse(new TextDecoder().decode(data));
    if (msg.type === 'chat') chatListeners.forEach(fn => fn(msg));
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

export async function joinLive(roomName, videoEl, identity) {
  const ident = identity || `viewer-${Date.now()}`;
  const token = await getLivekitToken(roomName, ident, false);
  const room = new Room();

  room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
    if (track.kind === Track.Kind.Video) track.attach(videoEl);
  });
  room.on(RoomEvent.DataReceived, (data) => {
    const msg = JSON.parse(new TextDecoder().decode(data));
    if (msg.type === 'chat') chatListeners.forEach(fn => fn(msg));
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
