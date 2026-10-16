// ─────────────────────────────────────────────────────────────────────────
// Yellowstone gRPC source (Shyft / Triton / Helius LaserStream). Lowest
// latency, but only for the cluster the endpoint serves — Shyft's
// grpc.*.shyft.to endpoints are mainnet-only.
// ─────────────────────────────────────────────────────────────────────────

import grpcModule, { CommitmentLevel, SubscribeRequest } from '@triton-one/yellowstone-grpc';
import * as anchor from '@coral-xyz/anchor';
import { logger } from '@carpet/shared';
import { dispatchLogs, type DispatchContext } from './dispatch.js';
import { markSeen } from './seen.js';

const Client: any = ((grpcModule as any)?.default ?? grpcModule);
const PING_INTERVAL_MS = 15_000;

interface GeyserOpts {
  ctx:       DispatchContext;
  endpoint:  string;
  xToken:    string;
  programId: string;
}

export function startGeyser(opts: GeyserOpts): void {
  let backoff = 1000;
  const reconnect = (why: string) => {
    logger.warn({ why, inMs: backoff }, 'gRPC stream down — reconnecting');
    setTimeout(() => { void connect(); }, backoff);
    backoff = Math.min(backoff * 2, 30_000);
  };

  async function connect(): Promise<void> {
    logger.info({ endpoint: opts.endpoint }, 'Connecting to Yellowstone gRPC');
    const client = new Client(opts.endpoint, opts.xToken, { 'grpc.max_receive_message_length': 64 * 1024 * 1024 });

    let stream: any;
    try {
      stream = await client.subscribe();
    } catch (err) {
      reconnect((err as Error).message);
      return;
    }

    let closed = false;
    const close = (why: string) => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      try { stream.end(); } catch {}
      reconnect(why);
    };

    stream.on('data', (msg: any) => {
      if (msg.pong || msg.ping) return;
      const tx = msg.transaction?.transaction;
      if (!tx) return;
      backoff = 1000;
      const signature = extractSignature(tx);
      if (!markSeen(signature)) return;
      void dispatchLogs(opts.ctx, {
        signature,
        slot: Number(msg.transaction.slot || 0),
        logs: tx.meta?.logMessages ?? [],
      }).catch(err => logger.error({ err: (err as Error).message }, 'gRPC dispatch failed'));
    });
    stream.on('error', (err: Error) => close(err.message));
    stream.on('end', () => close('stream ended'));

    const request: SubscribeRequest = {
      accounts: {}, slots: {}, transactionsStatus: {}, blocks: {}, blocksMeta: {}, entry: {}, accountsDataSlice: [],
      transactions: {
        carpet: { vote: false, failed: false, accountInclude: [opts.programId], accountExclude: [], accountRequired: [] },
      },
      commitment: CommitmentLevel.CONFIRMED,
    };
    await new Promise<void>((resolve, reject) => stream.write(request, (e: Error | null) => e ? reject(e) : resolve()));

    // Load balancers drop idle HTTP/2 streams; Yellowstone answers pings with pongs.
    const ping = setInterval(() => {
      stream.write({ ping: { id: 1 }, accounts: {}, slots: {}, transactions: {}, transactionsStatus: {}, blocks: {}, blocksMeta: {}, entry: {}, accountsDataSlice: [] }, () => {});
    }, PING_INTERVAL_MS);

    logger.info('Yellowstone subscription active');
  }

  void connect();
}

function extractSignature(tx: any): string {
  const raw = tx?.signature || tx?.transaction?.signatures?.[0] || [];
  if (typeof raw === 'string') return raw;
  return anchor.utils.bytes.bs58.encode(Buffer.from(raw));
}
