// Signatures already dispatched in this process. Live sources and the
// catch-up poller overlap on purpose; this keeps them from double-handling.
// The DB writes are idempotent anyway — this just saves RPC calls.

const MAX = 50_000;
const seen = new Set<string>();

/** Returns true the first time a signature is seen. */
export function markSeen(signature: string): boolean {
  if (seen.has(signature)) return false;
  seen.add(signature);
  if (seen.size > MAX) {
    // Sets iterate in insertion order: drop the oldest tenth.
    let drop = MAX / 10;
    for (const s of seen) { seen.delete(s); if (--drop <= 0) break; }
  }
  return true;
}
