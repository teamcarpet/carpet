// ─────────────────────────────────────────────────────────────────────────
// Anchor event decoder — supports Anchor 0.30+ IDL format.
//
// Anchor emits events via `emit!()` which writes a base64 self-CPI log:
//   "Program data: <base64 encoded 8-byte discriminator + borsh payload>"
//
// In Anchor 0.30+ each event has its own `discriminator: number[]` in the
// IDL's `events` array. We match the first 8 bytes of each Program data
// payload against those discriminators, then decode the rest with BorshCoder.
//
// The legacy `EventParser` from `@coral-xyz/anchor` does NOT handle this
// format — it silently returns no events when the IDL has the new shape,
// which is why `eventCount` was always 0 in the indexer logs.
// ─────────────────────────────────────────────────────────────────────────

import { BorshCoder, type Idl } from '@coral-xyz/anchor';
import { logger } from '@carpet/shared';
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

const PROGRAM_DATA_PREFIX = 'Program data: ';

let coder:        BorshCoder | null = null;
let loadedIdl:    Idl | null = null;
// Map: hex(8-byte discriminator) → event name.
let discToName:   Map<string, string> = new Map();

/**
 * Lazy-initialise the decoder. Called once on first use.
 * The IDL file must be available at runtime — bundled or volume-mounted.
 *
 * Resolution order for the IDL path:
 *   1. process.env.IDL_PATH (absolute or relative to cwd)
 *   2. ./idl/launchpad.json relative to cwd
 */
export async function initDecoder(programId: string): Promise<boolean> {
  try {
    const raw = process.env.IDL_PATH ?? 'idl/launchpad.json';
    const idlPath = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
    const idl = JSON.parse(readFileSync(idlPath, 'utf-8')) as Idl & {
      events?: Array<{ name: string; discriminator: number[] }>;
    };

    coder     = new BorshCoder(idl);
    loadedIdl = idl;

    // Build discriminator lookup table for fast event matching.
    discToName = new Map();
    for (const evt of idl.events ?? []) {
      if (!evt.discriminator || evt.discriminator.length !== 8) continue;
      const key = Buffer.from(evt.discriminator).toString('hex');
      discToName.set(key, evt.name);
    }

    logger.info({
      programId,
      idlPath,
      eventCount: discToName.size,
      events: Array.from(discToName.values()),
    }, 'Anchor event decoder initialised');
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
 *
 * Walks every "Program data: <base64>" log, peeks at the first 8 bytes of
 * the payload, and if it matches a known event discriminator, decodes the
 * rest with BorshCoder. Anything that doesn't match is ignored (it might
 * be from a different program in the same transaction).
 */
export function decodeEvents(logs: string[]): Array<{ name: string; data: unknown }> {
  if (!coder || discToName.size === 0) return [];

  const out: Array<{ name: string; data: unknown }> = [];

  for (const line of logs) {
    if (!line.startsWith(PROGRAM_DATA_PREFIX)) continue;

    const b64 = line.slice(PROGRAM_DATA_PREFIX.length).trim();
    let buf: Buffer;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      continue;
    }
    if (buf.length < 8) continue;

    const discKey = buf.subarray(0, 8).toString('hex');
    const name = discToName.get(discKey);
    if (!name) continue;  // not one of our events

    try {
      // BorshCoder.events.decode() expects the FULL base64 string (with the
      // discriminator); it strips the discriminator internally.
      const decoded = coder.events.decode(b64);
      if (decoded?.data) {
        out.push({ name: decoded.name, data: decoded.data });
      } else {
        // Fallback: should rarely happen if IDL matches the program.
        logger.debug({ name, b64Len: b64.length }, 'event matched but failed to decode');
      }
    } catch (err) {
      logger.debug({ name, err: (err as Error).message }, 'event decode threw');
    }
  }

  return out;
}
