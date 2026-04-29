export type PoolType = 'bonding' | 'presale';
export type TradeSide = 'buy' | 'sell';
export type Resolution = '1' | '5' | '15' | '60' | '240' | 'D';
/** A single trade event produced by tokens_bought / tokens_sold on-chain. */
export interface Trade {
    signature: string;
    pool: string;
    mint: string;
    account: string;
    side: TradeSide;
    amountSol: number;
    amountToken: number;
    priceUsd: number | null;
    priceSol: number;
    feePlatform: number;
    feeCreator: number;
    sellTax: number;
    timestamp: number;
    slot: number;
}
/** OHLCV bar for the chart. Aggregated from trades by TimescaleDB. */
export interface Candle {
    mint: string;
    resolution: Resolution;
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    trades: number;
}
/** Token metadata as returned from /token endpoint. */
export interface TokenInfo {
    mint: string;
    ticker: string;
    name: string;
    imageUrl: string | null;
    creator: string;
    poolType: PoolType;
    poolAddress: string;
    createdAt: number;
    priceUsd: number | null;
    priceSol: number;
    marketCap: number;
    ath: number;
    pctChange24h: number;
    mcChange24h: number;
    volume24h: number;
    holders: number;
    prog: number;
    isMigrated: boolean;
    meteoraPool: string | null;
}
export type WsOutbound = {
    type: 'trade';
    data: Trade;
} | {
    type: 'candle';
    data: Candle;
} | {
    type: 'pong';
    data: {
        ts: number;
    };
} | {
    type: 'subscribed';
    data: {
        channel: string;
    };
} | {
    type: 'unsubscribed';
    data: {
        channel: string;
    };
} | {
    type: 'error';
    data: {
        message: string;
    };
};
export type WsInbound = {
    type: 'subscribe';
    channel: 'trades' | 'candles';
    mint: string;
    resolution?: Resolution;
} | {
    type: 'unsubscribe';
    channel: 'trades' | 'candles';
    mint: string;
    resolution?: Resolution;
} | {
    type: 'ping';
};
