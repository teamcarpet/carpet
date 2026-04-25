// src/token-detail/data/tv-datafeed.js
// TradingView Charting Library Datafeed adapter.
// Implements the Datafeed JavaScript API v1.
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/datafeed-api/
//
// All data flows through candles-fetcher + trades-fetcher which hit
// the Carpet indexer backend at https://api.carpet.fun.

import { fetchCandles, subscribeCandles, unsubscribeCandles } from './candles-fetcher.js';

const SUPPORTED_RESOLUTIONS = ['1', '5', '15', '60', '240', 'D'];

const CONFIG = {
  supported_resolutions: SUPPORTED_RESOLUTIONS,
  exchanges: [{ value: 'CARPET', name: 'Carpet', desc: 'Carpet Launchpad' }],
  symbols_types: [{ name: 'crypto', value: 'crypto' }],
  supports_marks: false,
  supports_timescale_marks: false,
  supports_time: true,
};

export function createDatafeed(mint) {
  return {
    /** Called once on widget startup. */
    onReady(callback) {
      setTimeout(() => callback(CONFIG), 0);
    },

    /** Resolve a symbol to its metadata. For us there's exactly one symbol: the mint. */
    resolveSymbol(symbolName, onResolve, onError) {
      // symbolName format: either raw mint or "mint:priceMode"
      const [resolvedMint] = symbolName.split(':');
      try {
        onResolve({
          ticker:           symbolName,
          name:             resolvedMint.slice(0, 8),
          description:      `Carpet · ${resolvedMint.slice(0, 8)}…`,
          type:             'crypto',
          session:          '24x7',
          timezone:         'Etc/UTC',
          exchange:         'CARPET',
          listed_exchange:  'CARPET',
          minmov:           1,
          pricescale:       100_000_000,  // 8 decimals — crypto-typical
          has_intraday:     true,
          has_daily:        true,
          has_weekly_and_monthly: false,
          supported_resolutions:  SUPPORTED_RESOLUTIONS,
          volume_precision: 4,
          data_status:      'streaming',
        });
      } catch (err) {
        onError(err.message);
      }
    },

    /** Historical bars for a time range. Called repeatedly as user scrolls. */
    async getBars(symbolInfo, resolution, periodParams, onResult, onError) {
      const { from, to, countBack, firstDataRequest } = periodParams;
      try {
        const [resolvedMint, priceMode = 'mcap'] = symbolInfo.ticker.split(':');
        const bars = await fetchCandles({
          mint:       resolvedMint,
          resolution,
          from,
          to,
          countBack,
          priceMode,
        });
        if (!bars || !bars.length) {
          return onResult([], { noData: true });
        }
        // Each bar: { time (ms), open, high, low, close, volume }
        onResult(
          bars.map(b => ({
            time:   b.time * 1000,   // TV expects ms
            open:   b.open,
            high:   b.high,
            low:    b.low,
            close:  b.close,
            volume: b.volume,
          })),
          { noData: false }
        );
      } catch (err) {
        console.error('[datafeed] getBars error', err);
        onError(err.message || 'getBars failed');
      }
    },

    /** Real-time subscription. subscriberUID is unique per subscription. */
    subscribeBars(symbolInfo, resolution, onTick, subscriberUID) {
      const [resolvedMint, priceMode = 'mcap'] = symbolInfo.ticker.split(':');
      subscribeCandles({
        subscriberUID,
        mint:       resolvedMint,
        resolution,
        priceMode,
        onTick: (bar) => onTick({
          time:   bar.time * 1000,
          open:   bar.open,
          high:   bar.high,
          low:    bar.low,
          close:  bar.close,
          volume: bar.volume,
        }),
      });
    },

    unsubscribeBars(subscriberUID) {
      unsubscribeCandles(subscriberUID);
    },

    /** Search — not used when header_symbol_search is disabled, but required by interface. */
    searchSymbols(_userInput, _exchange, _symbolType, onResult) {
      onResult([]);
    },
  };
}
