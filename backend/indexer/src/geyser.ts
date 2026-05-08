// ─────────────────────────────────────────────────────────────────────────
// Yellowstone gRPC subscription (Phase 3).
//
// Subscribes to ALL transactions involving the CARPET program ID, decodes
// Anchor events from CPI logs, and dispatches typed events to the handlers.
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

// ── Metaplex metadata helpers ─────────────────────────────────────────────
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

function metadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  );
  return pda;
}

// Metaplex stores strings as u32-LE length + UTF-8 bytes, null-padded.
function readPascalString(buf: Buffer, offset: number): { value: string; nextOffset: number } {
  const len = buf.readUInt32LE(offset);
  const raw = buf.slice(offset + 4, offset + 4 + len);
  const value = raw.toString('utf8').replace(/\0/g, '').trim();
  return { value, nextOffset: offset + 4 + len };
}

interface TokenMeta { name: string; symbol: string; uri: string; }

/**
 * Fetch Metaplex metadata for a mint.
 * Layout after the 1-byte key: 32B update_authority, 32B mint, then pascal strings.
 * Returns null on any failure so callers fall back to placeholders.
 */
async function fetchTokenMeta(connection: Connection, mint: string): Promise<TokenMeta | null> {
  try {
    const pda = metadataPda(new PublicKey(mint));
    const info = await connection.getAccountInfo(pda);
    if (!info?.data) return null;
    const buf = Buffer.from(info.data);
    let offset = 1 + 32 + 32; // key + update_authority + mint
    const { value: name,   nextOffset: o1 } = readPascalString(buf, offset);
    const { value: symbol, nextOffset: o2 } = readPascalString(buf, o1);
    const { value: uri             }        = readPascalString(buf, o2);
    return { name, symbol, uri };
  } catch (err) {
    logger.debug({ mint, err: (err as Error).message }, 'fetchTokenMeta failed — using placeholder');
    return null;
  }
}

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
    // Without the IDL we cannot decode any Anchor events — fail loudly so
    // Railway restarts the service rather than silently swallowing everything.
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
      connection,
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
  if (v && typeof (v as any).toBase58 === 'function') return (v as any).toBase58();
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
  redis:      Redis;
  program:    anchor.Program;
  connection: Connection;
  signature:  string;
  slot:       number;
  events:     Array<{ name: string; data: unknown }>;
}) {
  for (const evt of args.events) {
    const data = evt.data as Record<string, unknown>;

    if (evt.name === 'PoolCreated') {
      const mint = pubkey(data.mint);
      // Fetch real name/symbol/image from Metaplex metadata account.
      // Falls back to placeholders when the metadata account doesn't exist yet.
      const meta    = await fetchTokenMeta(args.connection, mint);
      const ticker   = meta?.symbol || mint.slice(0, 4).toUpperCase();
      const name     = meta?.name   || `TOKEN ${mint.slice(0, 6)}`;
      const imageUrl = meta?.uri    || null;

      await handlePoolCreated({
        pool: pubkey(data.pool),
        mint,
        creator: pubkey(data.creator),
        ticker,
        name,
        imageUrl,
        poolType: poolTypeName(data.poolType),
        migrationTarget: sol(data.migrationTarget),
        timestamp: num(data.timestamp),
        slot: args.slot,
      }, args.redis);

    } else if (evt.name === 'TokensBought' || evt.name === 'TokensSold') {
      const pool = pubkey(data.pool);
      const snapshot = await fetchPoolByAddress(args.program, pool);
      const isBuy = evt.name === 'TokensBought';
      const amountSol   = sol(data.solAmount);
      const amountToken = token(data.tokenAmount);
      const priceSol    = amountToken > 0 ? amountSol / amountToken : sol(data.newPrice);
      const migrationTarget = sol((snapshot.account as any).migrationTarget);
      const totalRaisedSol  = sol((snapshot.account as any).realSolReserves ?? 0);
      const progressPct = migrationTarget > 0 ? Math.min(100, (totalRaisedSol / migrationTarget) * 100) : 0;

      await handleTrade({
        signature: args.signature,
        pool,
        mint: pubkey((snapshot.account as any).mint),
        account: pubkey(isBuy ? data.buyer : data.seller),
        side: isBuy ? 'buy' : 'sell',
        amountSol,
        amountToken,
        priceUsd: null,
        priceSol,
        feePlatform: sol(data.platformFee),
        feeCreator: sol(data.creatorFee),
        sellTax: isBuy ? 0 : sol(data.sellTax),
        timestamp: num(data.timestamp),
        slot: args.slot,
        totalRaisedSol,
        migrationTarget,
        progressPct,
        reserveSol: totalRaisedSol,
        reserveToken: token((snapshot.account as any).realTokenReserves ?? 0),
        marketCap: priceSol * 1_000_000_000,
      } as any, args.redis);

    } else if (evt.name === 'PresaleContribution') {
      const pool = pubkey(data.pool);
      const snapshot = await fetchPoolByAddress(args.program, pool);
      await handlePresaleContribution({
        pool,
        mint: pubkey((snapshot.account as any).mint),
        contributor: pubkey(data.contributor),
        amountSol: sol(data.solAmount),
        totalRaisedSol: sol(data.totalRaised),
        round: 0,
        timestamp: num(data.timestamp),
      }, args.redis);

    } else if (evt.name === 'PresaleClaimed') {
      const pool = pubkey(data.pool);
      const snapshot = await fetchPoolByAddress(args.program, pool);
      await handlePresaleClaim({
        pool,
        mint: pubkey((snapshot.account as any).mint),
        account: pubkey(data.user),
        amount: token(data.tokenAmount),
        timestamp: num(data.timestamp),
      }, args.redis);

    } else if (evt.name === 'PresaleRefunded') {
      const pool = pubkey(data.pool);
      const snapshot = await fetchPoolByAddress(args.program, pool);
      await handlePresaleRefund({
        pool,
        mint: pubkey((snapshot.account as any).mint),
        account: pubkey(data.user),
        amount: sol(data.solAmount),
        timestamp: num(data.timestamp),
      }, args.redis);

    } else if (evt.name === 'MigrationReady') {
      await handleMigrationReady({
        pool: pubkey(data.pool),
        mint: '',
        reserveSol: sol(data.solRaised),
        timestamp: num(data.timestamp),
      }, args.redis);

    } else if (evt.name === 'MigrationCompleted') {
      const pool = pubkey(data.pool);
      const snapshot = await fetchPoolByAddress(args.program, pool);
      await handleMigrationCompleted({
        pool,
        mint: pubkey((snapshot.account as any).mint),
        meteoraPool: pubkey(data.meteoraPool),
        reserveSol: sol(data.liquiditySol),
        timestamp: num(data.timestamp),
        slot: args.slot,
      }, args.redis);
    }
  }
}
