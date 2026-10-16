import 'dotenv/config';
import http from 'node:http';
import { uploadImage, uploadMetadata, livekitToken } from './handlers.js';

// Local stand-in for the Vercel Functions in api/. Vite proxies /api here
// during `npm run dev`; in production Vercel serves api/* directly.

const PORT = process.env.APP_SERVER_PORT || 3002;
const routes = {
  '/api/upload/image': uploadImage,
  '/api/upload/metadata': uploadMetadata,
  '/api/livekit-token': livekitToken,
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    return;
  }
  const handler = routes[url.pathname];
  if (!handler) { res.writeHead(404).end(); return; }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(url, {
    method: req.method,
    headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => {
  console.log(`[server] CARPET api on http://localhost:${PORT} (proxied by Vite at /api)`);
});
