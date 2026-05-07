// ─────────────────────────────────────────────────────────────────────────
// Anchor event decoder — Phase 3 (live Geyser).
//
// Anchor emits events via `emit!()` which writes a base64 self-CPI log
// like:
//   Program data: <base64 encoded 8-byte discriminator + borsh payload>
//
// We parse those logs from each transaction's logMessages, match the
// discriminator against our IDL, and produce typed event objects.
//
// To enable: copy contracts/target/idl/launchpad.json into this folder
// (or set IDL_PATH env var to its location) and uncomment the body below.
// Phase 1 ships this as a stub — geyser.ts logs raw signatures only.
// ─────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { BorshCoder, EventParser, type Idl } from '@coral-xyz/anchor';
import { logger } from '@carpet/shared';
import { PublicKey } from '@solana/web3.js';

let coder:  BorshCoder | null = null;
let parser: EventParser | null = null;

/**
 * Lazy-initialise the decoder. Called once on first use.
 * The IDL file must be available at runtime — bundled or volume-mounted.
 */
export async function initDecoder(programId: string): Promise<boolean> {
  try {
    const idl = loadIdl();

    coder  = new BorshCoder(idl);
    parser = new EventParser(new PublicKey(programId), coder);
    logger.info({ programId }, 'Anchor event decoder initialised');
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'IDL not available — decoder disabled');
    return false;
  }
}

export function loadIdl(): Idl {
  const candidates = [
    process.env.IDL_PATH,
    path.resolve(process.cwd(), 'idl/launchpad.json'),
    path.resolve(process.cwd(), '../../contracts/target/idl/launchpad.json'),
    path.resolve(process.cwd(), 'contracts/target/idl/launchpad.json'),
    path.resolve(import.meta.dirname, '../../../contracts/target/idl/launchpad.json'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const idl = JSON.parse(fs.readFileSync(candidate, 'utf8')) as Idl;
    return normalizeIdl(idl);
  }

  throw new Error(`launchpad IDL not found. Set IDL_PATH or build contracts/target/idl/launchpad.json`);
}

function normalizeIdl(idl: Idl): Idl {
  const next = JSON.parse(JSON.stringify(idl)) as any;
  if (Array.isArray(next.accounts)) {
    next.accounts = next.accounts.map((account: any) => (
      account.type ? account : { ...account, type: next.types?.find((type: any) => type.name === account.name)?.type }
    ));
  }
  return next as Idl;
}

/**
 * Decode events from a transaction's logMessages.
 * Returns an array of `{ name, data }` matched against the IDL's event list.
 */
export function decodeEvents(logs: string[]): Array<{ name: string; data: unknown }> {
  if (!parser) return [];
  const out: Array<{ name: string; data: unknown }> = [];
  try {
    const events = parser.parseLogs(logs);
    for (const evt of events) {
      out.push({ name: evt.name, data: evt.data });
    }
  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'log parsing failed (skipped)');
  }
  return out;
}
