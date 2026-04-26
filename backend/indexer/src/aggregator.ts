// ─────────────────────────────────────────────────────────────────────────
// Continuous aggregate refresher.
//
// TimescaleDB's continuous aggregate policies handle most of the work,
// but they have configurable lag (e.g. 1-minute candles refresh every
// minute, so the latest minute's bar is up to 60s stale). For the most
// recent bar we manually call `refresh_continuous_aggregate` to bring it
// current. This is mainly cosmetic — clients always get full history,
// just with a tiny delay on the freshest bar.
// ─────────────────────────────────────────────────────────────────────────

import { sql } from '@carpet/shared/db';
import { logger } from '@carpet/shared';

const VIEWS = ['candles_1m', 'candles_5m', 'candles_15m', 'candles_1h', 'candles_4h', 'candles_1d'];

async function refreshLatest(): Promise<void> {
  const now    = new Date();
  const window = new Date(now.getTime() - 5 * 60 * 1000);  // last 5 min
  for (const view of VIEWS) {
    try {
      // Refresh the latest window only — full refresh is expensive
      await sql.unsafe(
        `CALL refresh_continuous_aggregate('${view}', $1, $2)`,
        [window.toISOString(), now.toISOString()],
      );
    } catch (err) {
      // Don't kill the loop on transient errors
      logger.debug({ view, err: (err as Error).message }, 'aggregate refresh failed (ignored)');
    }
  }
}

export function startAggregator({ intervalMs }: { intervalMs: number }): void {
  logger.info({ intervalMs }, 'Aggregator started');
  setInterval(() => {
    void refreshLatest();
  }, intervalMs);
}
