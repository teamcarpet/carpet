// ─────────────────────────────────────────────────────────────────────────
// Candle aggregates. The views run in real-time mode (see migration 0002),
// so the API always sees fresh trades; refreshing just keeps the
// materialized part close to now so those queries stay cheap.
// ─────────────────────────────────────────────────────────────────────────

import { sql } from '@carpet/shared/db';
import { logger } from '@carpet/shared';

const VIEWS = ['candles_1m', 'candles_5m', 'candles_15m', 'candles_1h', 'candles_4h', 'candles_1d'];

async function refresh(from: Date | null, to: Date | null): Promise<void> {
  for (const view of VIEWS) {
    try {
      await sql.unsafe(
        `CALL refresh_continuous_aggregate('${view}', $1::timestamptz, $2::timestamptz)`,
        [from?.toISOString() ?? null, to?.toISOString() ?? null],
      );
    } catch (err) {
      logger.debug({ view, err: (err as Error).message }, 'aggregate refresh failed (ignored)');
    }
  }
}

/** Full refresh — after a backfill inserted trades older than the watermark. */
export async function refreshAllCandles(): Promise<void> {
  await refresh(null, new Date());
  logger.info('Candle aggregates refreshed');
}

export function startAggregator({ intervalMs }: { intervalMs: number }): void {
  setInterval(() => {
    const now = new Date();
    void refresh(new Date(now.getTime() - 10 * 60 * 1000), now);
  }, intervalMs);
}
