// ─────────────────────────────────────────────────────────────────────────
// CARPET WebSocket service
//
// Two upgrade paths supported:
//
// 1. URL-style (used by frontend candles-fetcher / trades-fetcher):
//    /stream?mint=X&resolution=R&priceMode=M     → pushes { type:'bar',   bar:{...} }
//    /trades-stream?mint=X&minSol=0.01           → pushes { type:'trade', trade:{...} }
//
// 2. JSON-style (programmatic clients, wscat tools):
//    /                                           → expects { type:'subscribe', ... }
//    Pushes { type:'trade', data:{...} } / { type:'candle', data:{...} }
// ─────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { loadEnv, logger, createRedis } from '@carpet/shared';
import { ConnectionManager } from './connections.js';
import { startRedisListener } from './redis-listener.js';

const env = loadEnv(z.object({
  WS_PORT: z.coerce.number().int().positive().default(3001),
}));

// ── HTTP server: health + WS upgrade routing ─────────────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url?.startsWith('/health?')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: Date.now(), connections: connections.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true });
const connections = new ConnectionManager();

httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/' || pathname === '/stream' || pathname === '/trades-stream') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, pathname, url.searchParams);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (
  socket: WebSocket,
  req: http.IncomingMessage,
  pathname: string,
  params: URLSearchParams,
) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const id = connections.add(socket, pathname);

  if (pathname === '/stream') {
    const mint       = params.get('mint');
    const resolution = params.get('resolution') ?? '1';
    const priceMode  = params.get('priceMode')  ?? 'mcap';
    if (!mint) { socket.send(JSON.stringify({ type: 'error', error: 'mint param required' })); socket.close(1008, 'mint required'); return; }
    connections.autoSubscribeCandles(id, mint, resolution, priceMode);
    logger.info({ id, ip, mint: mint.slice(0, 8), resolution }, 'candle stream connected');

  } else if (pathname === '/trades-stream') {
    const mint   = params.get('mint');
    const minSol = Number(params.get('minSol') ?? '0');
    if (!mint) { socket.send(JSON.stringify({ type: 'error', error: 'mint param required' })); socket.close(1008, 'mint required'); return; }
    connections.autoSubscribeTrades(id, mint, minSol);
    logger.info({ id, ip, mint: mint.slice(0, 8), minSol }, 'trade stream connected');

  } else {
    logger.info({ id, ip }, 'json client connected');
  }

  socket.on('close', () => {
    connections.remove(id);
    logger.info({ id, total: connections.size }, 'client disconnected');
  });

  socket.on('error', (err) => {
    logger.warn({ id, err: err.message }, 'socket error');
  });
});

// ── Redis subscriber drives broadcasts ───────────────────────────────────
const redisSub = createRedis(env.REDIS_URL, 'subscriber');
startRedisListener({ redis: redisSub, connections });

// ── Boot ─────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? env.WS_PORT);
httpServer.listen(port, '0.0.0.0', () => {
  logger.info({ port }, 'WS service listening');
});

// ── Graceful shutdown ────────────────────────────────────────────────────
function shutdown(reason: string): void {
  logger.info({ reason }, 'WS shutting down');
  for (const sock of connections.all()) sock.close(1001, 'server shutdown');
  wss.close();
  httpServer.close();
  redisSub.disconnect();
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
