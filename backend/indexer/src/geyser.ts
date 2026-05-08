// ─────────────────────────────────────────────────────────────────────────
// Yellowstone gRPC subscription.
// ─────────────────────────────────────────────────────────────────────────

import type Redis from 'ioredis';
import grpcModule, { CommitmentLevel, SubscribeRequest } from '@triton-one/yellowstone-grpc';
const Client: any = ((grpcModule as any)?.default ?? grpcModule);

import { logger } from '@carpet/shared';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { initDecoder, decodeEvents, loadIdl } from './decoder.js';
import { handlePoolCreated } from './handlers/pool-created.js';
import { handleTrade } from './handlers/tokens-bought.js';
import { handleMigrationCompleted, handleMigrationReady } from './handlers/migration.js';
import { handlePresaleContribution, handlePresaleClaim, handlePresaleRefund } from './handlers/presale.js';
import * as anchor from '@coral-xyz/anchor';

interface GeyserOpts {
  redis:     Redis;
  endpoint:  string;
  xToken:    string;
  programId: string;
  rpcUrl:    string;
}

export async function startGeyser(opts: GeyserOpts): Promise<void> {
  logger.info({ endpoint: opts.endpoint }, 'Connecting to Yellowstone gRPC');
  const decoderReady = await initDecoder(opts.programId);

  if (!decoderReady) {
    logger.fatal('IDL failed to load — check IDL_PATH env or bundled idl/launchpad.json. Exiting.');
    process.exit(1);
  }

  const connection = new Connection(opts.rpcUrl, 'confirmed');
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(Keypair.generate()),
    { commitment: 'confirmed' },
  );
  const program = new anchor.Program(loadIdl(), provider);

  const client = new Client(opts.endpoint, opts.xToken, {
    'grpc.max_receive_message_length': 64 * 1024 * 1024,
  });

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
    setTimeout(() => startGeyser(opts), 5000);
    return;
  }

  stream.on('data', (msg: any) => {
    if (!msg.transaction) return;
    const tx = msg.transaction.transaction;
    const signature = extractSignature(tx);
    const logs = extractLogs(tx);

    logger.debug({ slot: msg.transaction.slot, sig: signature.slice(0, 16), logCount: logs.length }, 'tx received');
    if (!logs.length) return;

    const events = decodeEvents(logs);
    logger.info({
      sig: signature.slice(0, 16),
      eventCount: events.length,
      eventNames: events.map(e => e.name),
      logCount: logs.length,
    }, 'tx decoded');

    void dispatchEvents({
      redis: opts.redis,
      program,
      signature,
      slot: Number(msg.transaction.slot || 0),
      events,
    }).catch((err) => {
      logger.error({ err: err.message, stack: err.stack, sig: signature.slice(0, 16) }, 'event dispatch failed');
    });
  });

  stream.on('error', (err: Error) => {
    logger.error({ err: err.message }, 'gRPC stream error — reconnecting in 5s');
    setTimeout(() => startGeyser(opts), 5000);
  });

  stream.on('end', () => {
    logger.warn('gRPC stream ended — reconnecting in 5s');
    setTimeout(() => startGeyser(opts), 5000);
  });

  await new Promise<void>((resolve, reject) => {
    stream.write(request, (err: Error | null | undefined) => err ? reject(err) : resolve());
  });

  logger.info('Yellowstone subscription active');
}

function extractSignature(tx: any): string {
  const raw = tx?.signature || tx?.transaction?.signature || tx?.transaction?.signatures?.[0] || [];
  if (typeof raw === 'string') return raw;
  return anchor.utils.bytes.bs58.encode(Buffer.from(raw));
}

function extractLogs(tx: any): string[] {
  return tx?.meta?.logMessages
    || tx?.transaction?.meta?.logMessages
    || tx?.transaction?.transaction?.meta?.logMessages
    || [];
}

function pubkey(v: unknown): string {
  if (v instanceof PublicKey) return v.toBase58();
  if (typeof v === 'string') return v;
  // Duck-type: handles PublicKey from a different @solana/web3.js instance bundled inside Anchor
  if (v && typeof (v as any).toBase58 === 'function') return (v as any).toBase58();
  // Handle raw 32-byte Uint8Array / Buffer
  if (v instanceof Uint8Array && v.length === 32) {
    try { return new PublicKey(v).toBase58(); } catch {}
  }
  return String(v);
}

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') { const n = Number(v); return Number.isNaN(n) ? 0 : n; }
  if (typeof v === 'object' && typeof (v as any).toString === 'function') {
    const s = (v as any).toString();
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
  }
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function sol(lamports: unknown): number { return num(lamports) / 1_000_000_000; }
function token(raw: unknown): number    { return num(raw)      / 1_000_000; }

function poolTypeName(poolType: unknown): 'bonding' | 'presale' {
  return num(poolType) === 1 ? 'presale' : 'bonding';
}

// ── Field access helper ────────────────────────────────────────────────────
// Anchor's BorshCoder may return snake_case OR camelCase field names
// depending on the version and IDL format. Support both to be safe.
function field(data: Record<string, unknown>, camel: string, snake: string): unknown {
  return data[camel] ?? data[snake];
}

async function fetchPoolByAddress(program: anchor.Program, pool: string) {
  const poolPk = new PublicKey(pool);
  const accounts = program.account as any;
  try {
    const account = await accounts.bondingCurvePool.fetch(poolPk);
    return { type: 'bonding' as const, account };
  } catch {}
  const account = await accounts.presalePool.fetch(poolPk);
  return { type: 'presale' as const, account };
}

async function dispatchEvents(args: {
  redis:     Redis;
  program:   anchor.Program;
  signature: string;
  slot:      number;
  events:    Array<{ name: string; data: unknown }>;
}) {
  for (const evt of args.events) {
    const data = evt.data as Record<string, unknown>;

    // Log the raw decoded data so we can see exact field names in Railway logs
    logger.debug({ eventName: evt.name, dataKeys: Object.keys(data) }, 'event data keys');

    try {
      if (evt.name === 'PoolCreated') {
        const mint      = pubkey(data.mint);
        const pool      = pubkey(data.pool);
        const creator   = pubkey(data.creator);
        const poolType  = field(data, 'poolType',        'pool_type');
        const migTarget = field(data, 'migrationTarget', 'migration_target');
        const timestamp = data.timestamp;

        logger.info({ mint: mint.slice(0, 8), pool: pool.slice(0, 8), poolType, migTarget }, 'PoolCreated dispatch');

        await handlePoolCreated({
          pool,
          mint,
          creator,
          ticker:          mint.slice(0, 4).toUpperCase(),
          name:            `TOKEN ${mint.slice(0, 6)}`,
          imageUrl:        null,
          poolType:        poolTypeName(poolType),
          migrationTarget: sol(migTarget),
          timestamp:       num(timestamp),
          slot:            args.slot,
        }, args.redis);

      } else if (evt.name === 'TokensBought' || evt.name === 'TokensSold') {
        const pool       = pubkey(data.pool);
        const snapshot   = await fetchPoolByAddress(args.program, pool);
        const isBuy      = evt.name === 'TokensBought';
        const amountSol  = sol(field(data, 'solAmount',   'sol_amount'));
        const amountToken = token(field(data, 'tokenAmount', 'token_amount'));
        const newPrice   = field(data, 'newPrice', 'new_price');
        const priceSol   = amountToken > 0 ? amountSol / amountToken : sol(newPrice);
        const migrationTarget = sol((snapshot.account as any).migrationTarget ?? (snapshot.account as any).migration_target);
        const totalRaisedSol  = sol((snapshot.account as any).realSolReserves  ?? (snapshot.account as any).real_sol_reserves  ?? 0);
        const progressPct = migrationTarget > 0 ? Math.min(100, (totalRaisedSol / migrationTarget) * 100) : 0;

        await handleTrade({
          signature: args.signature,
          pool,
          mint:        pubkey((snapshot.account as any).mint),
          account:     pubkey(isBuy ? data.buyer : data.seller),
          side:        isBuy ? 'buy' : 'sell',
          amountSol,
          amountToken,
          priceUsd:    null,
          priceSol,
          feePlatform: sol(field(data, 'platformFee', 'platform_fee')),
          feeCreator:  sol(field(data, 'creatorFee',  'creator_fee')),
          sellTax:     isBuy ? 0 : sol(field(data, 'sellTax', 'sell_tax')),
          timestamp:   num(data.timestamp),
          slot:        args.slot,
          totalRaisedSol,
          migrationTarget,
          progressPct,
          reserveSol:  totalRaisedSol,
          reserveToken: token((snapshot.account as any).realTokenReserves ?? (snapshot.account as any).real_token_reserves ?? 0),
          marketCap:   priceSol * 1_000_000_000,
        } as any, args.redis);

      } else if (evt.name === 'PresaleContribution') {
        const pool = pubkey(data.pool);
        const snapshot = await fetchPoolByAddress(args.program, pool);
        await handlePresaleContribution({
          pool,
          mint:          pubkey((snapshot.account as any).mint),
          contributor:   pubkey(data.contributor),
          amountSol:     sol(field(data, 'solAmount',   'sol_amount')),
          totalRaisedSol: sol(field(data, 'totalRaised', 'total_raised')),
          round: 0,
          timestamp: num(data.timestamp),
        }, args.redis);

      } else if (evt.name === 'PresaleClaimed') {
        const pool = pubkey(data.pool);
        const snapshot = await fetchPoolByAddress(args.program, pool);
        await handlePresaleClaim({
          pool,
          mint:    pubkey((snapshot.account as any).mint),
          account: pubkey(data.user),
          amount:  token(field(data, 'tokenAmount', 'token_amount')),
          timestamp: num(data.timestamp),
        }, args.redis);

      } else if (evt.name === 'PresaleRefunded') {
        const pool = pubkey(data.pool);
        const snapshot = await fetchPoolByAddress(args.program, pool);
        await handlePresaleRefund({
          pool,
          mint:    pubkey((snapshot.account as any).mint),
          account: pubkey(data.user),
          amount:  sol(field(data, 'solAmount', 'sol_amount')),
          timestamp: num(data.timestamp),
        }, args.redis);

      } else if (evt.name === 'MigrationReady') {
        await handleMigrationReady({
          pool:      pubkey(data.pool),
          mint:      '',
          reserveSol: sol(field(data, 'solRaised', 'sol_raised')),
          timestamp:  num(data.timestamp),
        }, args.redis);

      } else if (evt.name === 'MigrationCompleted') {
        const pool = pubkey(data.pool);
        const snapshot = await fetchPoolByAddress(args.program, pool);
        await handleMigrationCompleted({
          pool,
          mint:        pubkey((snapshot.account as any).mint),
          meteoraPool: pubkey(field(data, 'meteoraPool', 'meteora_pool')),
          reserveSol:  sol(field(data, 'liquiditySol', 'liquidity_sol')),
          timestamp:   num(data.timestamp),
          slot:        args.slot,
        }, args.redis);
      }
    } catch (evtErr) {
      // Isolate per-event errors — one failed event must NOT abort the rest
      logger.error({
        eventName: evt.name,
        err: (evtErr as Error).message,
        stack: (evtErr as Error).stack,
      }, 'single event dispatch failed');
    }
  }
}
