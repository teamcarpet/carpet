// ─────────────────────────────────────────────────────────────────────────
// Connection manager — supports both URL-style and JSON-style clients.
//
// URL-style: connection is auto-subscribed via path+query at connect time.
//   - /stream         → candles for one mint, fixed resolution
//   - /trades-stream  → trades for one mint, with optional minSol filter
//   - Server pushes  { type:'bar',   bar:{...} }   for candles
//                    { type:'trade', trade:{...} } for trades
//
// JSON-style: connection is plain WS, client sends subscribe messages.
//   - Server pushes  { type:'trade',  data:{...} }
//                    { type:'candle', data:{...} }
//
// Inverse indexes (mint→sockets) make broadcast O(1) regardless of style.
// ─────────────────────────────────────────────────────────────────────────

import type { WebSocket } from 'ws';
import { z } from 'zod';
import { logger } from '@carpet/shared';
import type { WsInbound, WsOutbound, Trade, Candle } from '@carpet/shared/types';

const inboundSchema: z.ZodType<WsInbound> = z.discriminatedUnion('type', [
  z.object({
    type:       z.literal('subscribe'),
    channel:    z.enum(['trades', 'candles']),
    mint:       z.string().min(32).max(44),
    resolution: z.enum(['1', '5', '15', '60', '240', 'D']).optional(),
  }),
  z.object({
    type:       z.literal('unsubscribe'),
    channel:    z.enum(['trades', 'candles']),
    mint:       z.string().min(32).max(44),
    resolution: z.enum(['1', '5', '15', '60', '240', 'D']).optional(),
  }),
  z.object({ type: z.literal('ping') }),
]);

type ConnStyle = 'json' | 'url-stream' | 'url-trades';

interface Connection {
  id:        string;
  socket:    WebSocket;
  style:     ConnStyle;
  trades:    Set<string>;             // mint addresses
  candles:   Set<string>;             // `${mint}:${resolution}`
  minSol?:   number;                  // for /trades-stream filter
}

let nextId = 1;

export class ConnectionManager {
  private byId = new Map<string, Connection>();

  // Inverse indexes for O(1) broadcast
  private tradeSubs  = new Map<string, Set<string>>();   // mint → socketIds
  private candleSubs = new Map<string, Set<string>>();   // `mint:res` → socketIds

  get size(): number { return this.byId.size; }

  all(): WebSocket[] {
    return Array.from(this.byId.values()).map(c => c.socket);
  }

  add(socket: WebSocket, pathname: string = '/'): string {
    const id = `c${nextId++}`;
    const style: ConnStyle =
      pathname === '/stream'        ? 'url-stream'  :
      pathname === '/trades-stream' ? 'url-trades'  : 'json';

    const conn: Connection = { id, socket, style, trades: new Set(), candles: new Set() };
    this.byId.set(id, conn);

    // Only JSON-style clients can send subscribe messages
    if (style === 'json') {
      socket.on('message', (raw) => this._onMessage(conn, raw.toString()));
    }
    return id;
  }

  remove(id: string): void {
    const conn = this.byId.get(id);
    if (!conn) return;
    for (const mint of conn.trades)  this._removeFromIndex(this.tradeSubs, mint, id);
    for (const key  of conn.candles) this._removeFromIndex(this.candleSubs, key, id);
    this.byId.delete(id);
  }

  // ── URL-style auto-subscribe ────────────────────────────────────────────
  autoSubscribeCandles(id: string, mint: string, resolution: string, _priceMode: string): void {
    const conn = this.byId.get(id);
    if (!conn) return;
    const key = `${mint}:${resolution}`;
    conn.candles.add(key);
    this._addToIndex(this.candleSubs, key, id);
  }

  autoSubscribeTrades(id: string, mint: string, minSol: number): void {
    const conn = this.byId.get(id);
    if (!conn) return;
    conn.trades.add(mint);
    conn.minSol = minSol;
    this._addToIndex(this.tradeSubs, mint, id);
  }

  // ── Broadcasters used by redis-listener.ts ──────────────────────────────
  broadcastTrade(trade: Trade): void {
    const ids = this.tradeSubs.get(trade.mint);
    if (!ids?.size) return;

    // Two wire formats — choose per connection style
    const urlMsg  = JSON.stringify({ type: 'trade', trade });
    const jsonMsg = JSON.stringify({ type: 'trade', data: trade } satisfies WsOutbound);

    for (const id of ids) {
      const conn = this.byId.get(id);
      if (!conn) continue;
      if (conn.socket.readyState !== conn.socket.OPEN) continue;

      // Apply minSol filter for url-trades subscribers
      if (conn.style === 'url-trades') {
        if (conn.minSol && trade.amountSol < conn.minSol) continue;
        conn.socket.send(urlMsg);
      } else {
        conn.socket.send(jsonMsg);
      }
    }
  }

  broadcastCandle(candle: Candle): void {
    const key = `${candle.mint}:${candle.resolution}`;
    const ids = this.candleSubs.get(key);
    if (!ids?.size) return;

    // URL-style format expected by frontend candles-fetcher
    const bar = {
      time:   candle.time,
      open:   candle.open,
      high:   candle.high,
      low:    candle.low,
      close:  candle.close,
      volume: candle.volume,
    };
    const urlMsg  = JSON.stringify({ type: 'bar', bar });
    const jsonMsg = JSON.stringify({ type: 'candle', data: candle } satisfies WsOutbound);

    for (const id of ids) {
      const conn = this.byId.get(id);
      if (!conn) continue;
      if (conn.socket.readyState !== conn.socket.OPEN) continue;

      if (conn.style === 'url-stream') conn.socket.send(urlMsg);
      else                              conn.socket.send(jsonMsg);
    }
  }

  // ── JSON-style message handling ─────────────────────────────────────────
  private _onMessage(conn: Connection, raw: string): void {
    let parsed: WsInbound;
    try {
      parsed = inboundSchema.parse(JSON.parse(raw));
    } catch {
      this._send(conn, { type: 'error', data: { message: 'Invalid message format' } });
      return;
    }

    if (parsed.type === 'ping') { this._send(conn, { type: 'pong', data: { ts: Date.now() } }); return; }
    if (parsed.type === 'subscribe')   { this._subscribe(conn, parsed);   return; }
    if (parsed.type === 'unsubscribe') { this._unsubscribe(conn, parsed); return; }
  }

  private _subscribe(conn: Connection, msg: Extract<WsInbound, { type: 'subscribe' }>): void {
    if (msg.channel === 'trades') {
      conn.trades.add(msg.mint);
      this._addToIndex(this.tradeSubs, msg.mint, conn.id);
      this._send(conn, { type: 'subscribed', data: { channel: `trades:${msg.mint.slice(0, 8)}` } });
    } else {
      const key = `${msg.mint}:${msg.resolution ?? '1'}`;
      conn.candles.add(key);
      this._addToIndex(this.candleSubs, key, conn.id);
      this._send(conn, { type: 'subscribed', data: { channel: `candles:${key.slice(0, 8)}` } });
    }
    logger.debug({ id: conn.id, channel: msg.channel, mint: msg.mint.slice(0, 8) }, 'subscribed');
  }

  private _unsubscribe(conn: Connection, msg: Extract<WsInbound, { type: 'unsubscribe' }>): void {
    if (msg.channel === 'trades') {
      conn.trades.delete(msg.mint);
      this._removeFromIndex(this.tradeSubs, msg.mint, conn.id);
    } else {
      const key = `${msg.mint}:${msg.resolution ?? '1'}`;
      conn.candles.delete(key);
      this._removeFromIndex(this.candleSubs, key, conn.id);
    }
  }

  // ── Index helpers ───────────────────────────────────────────────────────
  private _addToIndex(map: Map<string, Set<string>>, key: string, id: string): void {
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(id);
  }

  private _removeFromIndex(map: Map<string, Set<string>>, key: string, id: string): void {
    const set = map.get(key);
    if (!set) return;
    set.delete(id);
    if (!set.size) map.delete(key);
  }

  private _send(conn: Connection, msg: WsOutbound): void {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(msg));
  }
}
