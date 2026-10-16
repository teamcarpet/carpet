// ─────────────────────────────────────────────────────────────────────────
// RPC source: works on any cluster (devnet included) with a plain RPC URL.
//
//   live      — connection.onLogs(program): events arrive within ~1s
//   catch-up  — getSignaturesForAddress from a persisted cursor, oldest first.
//               On first boot this backfills the program's whole history; after
//               that it runs every few seconds as a safety net for anything the
//               websocket missed (RPC websockets drop silently).
// ─────────────────────────────────────────────────────────────────────────

import { PublicKey, type ConfirmedSignatureInfo } from '@solana/web3.js';
import { sql } from '@carpet/shared/db';
import { logger } from '@carpet/shared';
import { dispatchLogs, type DispatchContext } from './dispatch.js';
import { markSeen } from './seen.js';

const CURSOR_ID = 'main';
const PAGE = 1000;
// Public RPCs rate-limit bursts of getTransaction; pace the backfill.
const TX_FETCH_GAP_MS = Number(process.env.TX_FETCH_GAP_MS ?? 120);

interface RpcSourceOpts {
  ctx:        DispatchContext;
  programId:  string;
  live:       boolean;   // subscribe to logs (off when gRPC provides live data)
  pollMs:     number;
}

async function readCursor(): Promise<string | null> {
  const [row] = await sql`SELECT last_sig FROM indexer_cursor WHERE id = ${CURSOR_ID}`;
  return row?.last_sig ?? null;
}

async function writeCursor(signature: string, slot: number): Promise<void> {
  await sql`
    INSERT INTO indexer_cursor (id, last_slot, last_sig, updated_at)
    VALUES (${CURSOR_ID}, ${slot}, ${signature}, NOW())
    ON CONFLICT (id) DO UPDATE SET last_slot = EXCLUDED.last_slot, last_sig = EXCLUDED.last_sig, updated_at = NOW()
  `;
}

async function withRetry<T>(what: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let delay = 500;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      logger.debug({ what, attempt: i, err: (err as Error).message }, 'rpc retry');
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

export function startRpcSource(opts: RpcSourceOpts): { caughtUp: Promise<void> } {
  const { ctx } = opts;
  const program = new PublicKey(opts.programId);
  let running = false;

  async function catchUp(): Promise<number> {
    if (running) return 0;
    running = true;
    try {
      const until = (await readCursor()) ?? undefined;

      // Walk newest → oldest until we hit the cursor, then replay oldest → newest.
      const pending: ConfirmedSignatureInfo[] = [];
      let before: string | undefined;
      for (;;) {
        const page = await withRetry('getSignaturesForAddress', () =>
          ctx.connection.getSignaturesForAddress(program, { before, until, limit: PAGE }, 'confirmed'));
        pending.push(...page);
        if (page.length < PAGE) break;
        before = page[page.length - 1]!.signature;
      }
      if (!pending.length) return 0;
      pending.reverse();

      if (!until) logger.info({ transactions: pending.length }, 'Backfilling program history');

      let processed = 0;
      for (const info of pending) {
        if (!info.err && markSeen(info.signature)) {
          if (TX_FETCH_GAP_MS) await new Promise(r => setTimeout(r, TX_FETCH_GAP_MS));
          const tx = await withRetry('getTransaction', () =>
            ctx.connection.getTransaction(info.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }));
          if (tx && !tx.meta?.err) {
            processed += await dispatchLogs(ctx, {
              signature: info.signature,
              slot: tx.slot,
              logs: tx.meta?.logMessages ?? [],
            });
          }
        }
        // Advance only after the transaction is fully handled, so a crash
        // mid-way resumes from the right place.
        await writeCursor(info.signature, info.slot);
      }
      if (!until || processed) logger.info({ transactions: pending.length, events: processed }, 'Catch-up done');
      return processed;
    } finally {
      running = false;
    }
  }

  if (opts.live) {
    ctx.connection.onLogs(program, (entry, context) => {
      if (entry.err || !markSeen(entry.signature)) return;
      void dispatchLogs(ctx, { signature: entry.signature, slot: context.slot, logs: entry.logs })
        .catch(err => logger.error({ err: (err as Error).message }, 'live dispatch failed'));
    }, 'confirmed');
    logger.info('RPC log subscription active');
  }

  const caughtUp = catchUp().then(() => undefined);
  caughtUp.catch(err => logger.error({ err: (err as Error).message }, 'initial catch-up failed'));

  setInterval(() => {
    void catchUp().catch(err => logger.warn({ err: (err as Error).message }, 'catch-up failed — will retry'));
  }, opts.pollMs);

  return { caughtUp };
}
