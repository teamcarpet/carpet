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

let coder:  BorshCoder | null = null;
let parser: EventParser | null = null;

/**
 * Lazy-initialise the decoder. Called once on first use.
 * The IDL file must be available at runtime — bundled or volume-mounted.
 */
export async function initDecoder(programId: string): Promise<boolean> {
  try {
    // We import dynamically so the indexer can boot without the IDL
    // (mock mode doesn't need it).
    const idlPath = process.env.IDL_PATH ?? './idl/launchpad.json';
    const mod = await import(idlPath, { assert: { type: 'json' } }) as { default: Idl };
    const idl = mod.default;

    coder  = new BorshCoder(idl);
    parser = new EventParser({ programId } as never, coder);
    logger.info({ programId }, 'Anchor event decoder initialised');
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'IDL not available — decoder disabled');
    return false;
  }
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
