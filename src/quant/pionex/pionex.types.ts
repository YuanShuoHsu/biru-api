// https://www.pionex.com/docs/llms.txt

export const PIONEX_MARKET_TYPES = ['SPOT', 'PERP'] as const;

export type PionexMarketType = (typeof PIONEX_MARKET_TYPES)[number];

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
  '1W',
  '1m',
] as const;

export type PionexKlineInterval = (typeof PIONEX_KLINE_INTERVALS)[number];

// 文件列了 1W（週）與 1m（月），但 REST 實際回 MARKET_PARAMETER_ERROR，只能由日 K 合成
export const AGGREGATED_KLINE_INTERVALS = ['1W', '1m'] as const;

export type NativeKlineInterval = Exclude<
  PionexKlineInterval,
  (typeof AGGREGATED_KLINE_INTERVALS)[number]
>;

export const isNativeKlineInterval = (
  interval: PionexKlineInterval,
): interval is NativeKlineInterval =>
  !(AGGREGATED_KLINE_INTERVALS as readonly string[]).includes(interval);

const MINUTE_MS = 60 * 1000;
const DAY_MS = 1440 * MINUTE_MS;

const NATIVE_KLINE_INTERVAL_MS: Record<NativeKlineInterval, number> = {
  '1M': MINUTE_MS,
  '5M': 5 * MINUTE_MS,
  '15M': 15 * MINUTE_MS,
  '30M': 30 * MINUTE_MS,
  '60M': 60 * MINUTE_MS,
  '4H': 240 * MINUTE_MS,
  '8H': 480 * MINUTE_MS,
  '12H': 720 * MINUTE_MS,
  '1D': DAY_MS,
};

/** K 線開盤時間：日以下依 UTC epoch 對齊，週從週一 00:00 UTC 起，月從每月 1 日 00:00 UTC 起 */
export const candleStartOf = (interval: PionexKlineInterval, time: number) => {
  if (isNativeKlineInterval(interval)) {
    const intervalMs = NATIVE_KLINE_INTERVAL_MS[interval];

    return Math.floor(time / intervalMs) * intervalMs;
  }

  const day = Math.floor(time / DAY_MS) * DAY_MS;
  if (interval === '1W')
    return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY_MS;

  const date = new Date(time);

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

export const candleEndOf = (interval: PionexKlineInterval, start: number) => {
  if (isNativeKlineInterval(interval))
    return start + NATIVE_KLINE_INTERVAL_MS[interval];
  if (interval === '1W') return start + 7 * DAY_MS;

  const date = new Date(start);

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
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
  type: 'SPOT';
}

export interface PionexPerpSymbol {
  baseCurrency: string;
  basePrecision: number;
  baseStep: string;
  liquidationFeeRate: string;
  maxImpactLimit: string;
  maxImpactMarket: string;
  maxOrderNum: number;
  maxSizeLimit: string;
  maxSizeMarket: string;
  minNotional: string;
  minSizeLimit: string;
  minSizeMarket: string;
  name: string;
  quoteCurrency: string;
  quotePrecision: number;
  quoteStep: string;
  status: 'TRADING' | 'OFFLINE';
  symbol: string;
  type: 'PERP';
}

export interface PionexRiskTier {
  maintMarginRatio: string;
  maxLeverage: string;
  notionalLimit: string;
  quickDeduction: string;
  rowNum: number;
}

export interface PionexFuturesIndex {
  indexPrice: string;
  markPrice: string;
  nextFundingRate: string;
  nextFundingTime: number;
  symbol: string;
  updateTime: number;
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

export const PIONEX_FUTURES_ORDER_TYPES = [
  'LIMIT',
  'MARKET_QTY',
  'IOC',
  'FOK',
  'POSTONLY',
] as const;
export const PIONEX_POSITION_SIDES = ['BOTH', 'LONG', 'SHORT'] as const;
export const PIONEX_POSITION_MODES = ['BUYSELL', 'OPENCLOSE'] as const;
export const PIONEX_MARGIN_MODES = ['CROSS', 'ISOLATED'] as const;
export const PIONEX_ISOLATED_MODES = [
  'CROSS',
  'ISOLATED_BOTH',
  'ISOLATED_LONG',
  'ISOLATED_SHORT',
] as const;

export type PionexFuturesOrderType =
  (typeof PIONEX_FUTURES_ORDER_TYPES)[number];
export type PionexPositionSide = (typeof PIONEX_POSITION_SIDES)[number];
export type PionexPositionMode = (typeof PIONEX_POSITION_MODES)[number];
export type PionexMarginMode = (typeof PIONEX_MARGIN_MODES)[number];
export type PionexIsolatedMode = (typeof PIONEX_ISOLATED_MODES)[number];

export interface PionexFuturesOrder {
  clientOrderId?: string;
  createTime: number;
  filledAmount: string;
  filledSize: string;
  isolatedMode: PionexIsolatedMode;
  orderId: string;
  origSize: string;
  positionMode: PionexPositionMode;
  positionSide: PionexPositionSide;
  price: string;
  reduceOnly: boolean;
  side: PionexOrderSide;
  size: string;
  source: 'MANUAL' | 'API' | 'SYSTEM' | 'TRIGGER';
  status: 'OPEN' | 'CLOSED';
  symbol: string;
  type: PionexFuturesOrderType;
  updateTime: number;
}

export interface PionexFuturesFill {
  fee: string;
  feeCoin: string;
  feeType: 'TRADING' | 'LIQUIDATION';
  id: string;
  orderId: string;
  price: string;
  role: 'MAKER' | 'TAKER';
  side: PionexOrderSide;
  size: string;
  symbol: string;
  timestamp: number;
}

export interface PionexPosition {
  avgPrice: string;
  createTime: number;
  initialMargin: string;
  isolatedMode: PionexIsolatedMode;
  leverage: string;
  liquidationPrice: string;
  maintMargin: string;
  markPrice: string;
  netSize: string;
  positionId: string;
  positionSide: 'LONG' | 'SHORT';
  symbol: string;
  unrealizedPnL: string;
  updateTime: number;
}

export interface PionexHistoryPosition {
  amountLong: string;
  amountSettled: string;
  amountShort: string;
  createTime: number;
  isolatedMode: PionexIsolatedMode;
  leverage: string;
  positionId: string;
  positionSide: 'LONG' | 'SHORT';
  sizeLiquidated: string;
  sizeLong: string;
  sizeShort: string;
  symbol: string;
  updateTime: number;
}

export interface PionexFuturesBalance {
  assets: string;
  available: string;
  coin: string;
  free: string;
  frozen: string;
  totalInitialMargin: string;
  transferable: string;
  unrealizedPnL: string;
}

export interface PionexFundingFee {
  fundingCoin: string;
  fundingFee: string;
  fundingRate: string;
  isolatedMode: 'CROSS' | 'ISOLATED';
  symbol: string;
  timestamp: number;
}
