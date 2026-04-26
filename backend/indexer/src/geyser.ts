// ─────────────────────────────────────────────────────────────────────────
// Yellowstone gRPC subscription (Phase 3).
//
// Subscribes to ALL transactions involving the CARPET program ID, decodes
// Anchor events from CPI logs, and dispatches typed events to the handlers.
//
// Phase 1 status: connection scaffold only. Decoding + handler wiring come
// in Phase 3 — at that point we'll need contracts/target/idl/launchpad.json
// imported as a JSON module for Anchor's BorshCoder.
//
// Reference:
//   https://github.com/rpcpool/yellowstone-grpc
//   https://docs.shyft.to/solana-yellowstone-grpc/solana-grpc-best-practices
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import Client, { CommitmentLevel, SubscribeRequest } from '@triton-one/yellowstone-grpc';
import { logger } from '@carpet/shared';

interface GeyserOpts {
  redis:     Redis;
  endpoint:  string;
  xToken:    string;
  programId: string;
}

export async function startGeyser(opts: GeyserOpts): Promise<void> {
  logger.info({ endpoint: opts.endpoint }, 'Connecting to Yellowstone gRPC');

  const client = new Client(opts.endpoint, opts.xToken, {
    'grpc.max_receive_message_length': 64 * 1024 * 1024, // 64 MB
  });

  // ── Subscription request ───────────────────────────────────────────────
  // Filter to transactions that touch our program. Yellowstone re-checks
  // server-side, so we don't waste bandwidth.
  const request: SubscribeRequest = {
    accounts:           {},
    slots:              {},
    transactions: {
      carpet: {
        vote:           false,
        failed:         false,
        accountInclude: [opts.programId],
        accountExclude: [],
        accountRequired:[],
      },
    },
    transactionsStatus: {},
    blocks:             {},
    blocksMeta:         {},
    entry:              {},
    accountsDataSlice:  [],
    commitment:         CommitmentLevel.CONFIRMED,
  };

  let stream: Awaited<ReturnType<typeof client.subscribe>>;
  try {
    stream = await client.subscribe();
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to open gRPC stream');
    setTimeout(() => startGeyser(opts), 5000);  // retry
    return;
  }

  stream.on('data', (msg) => {
    if (msg.transaction) {
      // Phase 3: decode Anchor events from msg.transaction.transaction.meta.logMessages
      // and dispatch to handlers. For now we log the slot to confirm wire is live.
      logger.debug({
        slot: msg.transaction.slot,
        sig:  Buffer.from(msg.transaction.transaction?.signature ?? []).toString('base64').slice(0, 16),
      }, 'tx received');
    }
  });

  stream.on('error', (err: Error) => {
    logger.error({ err: err.message }, 'gRPC stream error — reconnecting in 5s');
    setTimeout(() => startGeyser(opts), 5000);
  });

  stream.on('end', () => {
    logger.warn('gRPC stream ended — reconnecting in 5s');
    setTimeout(() => startGeyser(opts), 5000);
  });

  // Send the subscription request
  await new Promise<void>((resolve, reject) => {
    stream.write(request, (err: Error | null | undefined) => err ? reject(err) : resolve());
  });

  logger.info('Yellowstone subscription active');
}
