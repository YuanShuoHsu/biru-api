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
  side: PionexOrderSide;
  size: string;
  symbol: string;
  timestamp: number;
  tradeId: string;
}

export interface PionexBalance {
  coin: string;
  free: string;
  frozen: string;
}

export const PIONEX_ORDER_SIDES = ['BUY', 'SELL'] as const;
export const PIONEX_ORDER_TYPES = ['LIMIT', 'MARKET'] as const;

export type PionexOrderSide = (typeof PIONEX_ORDER_SIDES)[number];
export type PionexOrderType = (typeof PIONEX_ORDER_TYPES)[number];

export interface PionexOrder {
  amount?: string;
  clientOrderId?: string;
  createTime: number;
  fee: string;
  feeCoin: string;
  filledAmount: string;
  filledSize: string;
  IOC: boolean;
  orderId: string;
  price?: string;
  side: PionexOrderSide;
  size?: string;
  status: 'OPEN' | 'CLOSED';
  symbol: string;
  type: PionexOrderType;
  updateTime: number;
}

export interface PionexFill {
  fee: string;
  feeCoin: string;
  id: string;
  orderId: string;
  price: string;
  role: 'MAKER' | 'TAKER';
  side: PionexOrderSide;
  size: string;
  symbol: string;
  timestamp: number;
}
