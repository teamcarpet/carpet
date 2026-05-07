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

import { BorshCoder, EventParser, type Idl } from '@coral-xyz/anchor';
import { logger } from '@carpet/shared';
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

let coder:     BorshCoder | null = null;
let parser:    EventParser | null = null;
let loadedIdl: Idl | null = null;

/**
 * Lazy-initialise the decoder. Called once on first use.
 * The IDL file must be available at runtime — bundled or volume-mounted.
 *
 * Resolution order for the IDL path:
 *   1. process.env.IDL_PATH (absolute or relative to cwd)
 *   2. ./idl/launchpad.json relative to cwd
 *
 * We use fs.readFileSync rather than dynamic import() because in ESM
 * `import('./idl/...')` resolves relative to the CALLING MODULE'S file,
 * which after compilation lives in dist/, not the project root.
 */
export async function initDecoder(programId: string): Promise<boolean> {
  try {
    const raw = process.env.IDL_PATH ?? 'idl/launchpad.json';
    const idlPath = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
    const idl = JSON.parse(readFileSync(idlPath, 'utf-8')) as Idl;

    coder     = new BorshCoder(idl);
    parser    = new EventParser({ programId } as never, coder);
    loadedIdl = idl;
    logger.info({ programId, idlPath }, 'Anchor event decoder initialised');
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'IDL not available — decoder disabled');
    return false;
  }
}

/**
 * Returns the IDL loaded by initDecoder. Throws if initDecoder hasn't run
 * (or failed). Callers should only invoke this after a successful initDecoder.
 */
export function loadIdl(): Idl {
  if (!loadedIdl) {
    throw new Error('IDL not loaded — call initDecoder() first and check that it returned true');
  }
  return loadedIdl;
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
