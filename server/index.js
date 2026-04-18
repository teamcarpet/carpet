import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const LK_API_KEY = process.env.LIVEKIT_API_KEY || process.env.VITE_LIVEKIT_API_KEY;
const LK_SECRET  = process.env.LIVEKIT_API_SECRET;

if (!LK_API_KEY || !LK_SECRET) {
  console.warn('[server] Warning: LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set — /livekit-token will error');
}

app.post('/livekit-token', (req, res) => {
  const { roomName, identity, isPublisher } = req.body;
  if (!roomName || !identity) {
    return res.status(400).json({ error: 'roomName and identity are required' });
  }
  if (!LK_API_KEY || !LK_SECRET) {
    return res.status(500).json({ error: 'LiveKit credentials not configured on server' });
  }

  const at = new AccessToken(LK_API_KEY, LK_SECRET, {
    identity,
    ttl: '2h',
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: !!isPublisher,
    canSubscribe: true,
    canPublishData: true,
  });

  res.json({ token: at.toJwt() });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[server] CARPET backend running on http://localhost:${PORT}`);
});
