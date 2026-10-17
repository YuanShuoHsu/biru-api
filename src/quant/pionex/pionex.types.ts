// https://pionex-doc.gitbook.io/apidocs

export const PIONEX_KLINE_INTERVALS = [
  '1M',
  '5M',
  '15M',
  '30M',
  '60M',
  '4H',
  '8H',
  '12H',
  '1D',
] as const;

export type PionexKlineInterval = (typeof PIONEX_KLINE_INTERVALS)[number];

const MINUTE_MS = 60 * 1000;

export const PIONEX_KLINE_INTERVAL_MS: Record<PionexKlineInterval, number> = {
  '1M': MINUTE_MS,
  '5M': 5 * MINUTE_MS,
  '15M': 15 * MINUTE_MS,
  '30M': 30 * MINUTE_MS,
  '60M': 60 * MINUTE_MS,
  '4H': 240 * MINUTE_MS,
  '8H': 480 * MINUTE_MS,
  '12H': 720 * MINUTE_MS,
  '1D': 1440 * MINUTE_MS,
};

export interface PionexEnvelope<T> {
  code?: string;
  data?: T;
  message?: string;
  result: boolean;
  timestamp: number;
}

export interface PionexKline {
  close: string;
  high: string;
  low: string;
  open: string;
  time: number;
  volume: string;
}

export interface PionexTicker {
  amount: string;
  close: string;
  count: number;
  high: string;
  low: string;
  open: string;
  symbol: string;
  time: number;
  volume: string;
}

export interface PionexSymbol {
  amountPrecision: number;
  baseCurrency: string;
  basePrecision: number;
  buyCeiling: string;
  enable: boolean;
  maxTradeSize: string;
  minAmount: string;
  minTradeSize: string;
  quoteCurrency: string;
  quotePrecision: number;
  sellFloor: string;
  symbol: string;
  type: 'SPOT' | 'PERP';
}

export type PionexPriceLevel = [price: string, size: string];

export interface PionexDepth {
  asks: PionexPriceLevel[];
  bids: PionexPriceLevel[];
}

export interface PionexTrade {
  price: string;
  side: 'BUY' | 'SELL';
  size: string;
  symbol: string;
  timestamp: number;
  tradeId: string;
}
