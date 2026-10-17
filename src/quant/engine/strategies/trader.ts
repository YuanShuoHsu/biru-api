import type { FuturesLedger } from '../futures-account';
import type { Ledger } from '../ledger';
import type { BotOrder, StrategyContext } from '../types';

export type Direction = 1 | -1;

interface MarketOpen {
  /** 計價幣金額；合約會換算成數量 */
  amount: number;
  tag: string;
}

interface LimitOrder {
  price: number;
  size: number;
  tag: string;
}

/**
 * 單一方向的開平倉介面：現貨只能做多；合約依設定做多或做空，
 * 讓 DCA、指標、Webhook 策略只寫一份，價格方向用 direction 決定。
 */
export interface Trader {
  /** 這個方向的可用資金（計價幣名目） */
  budget(): number;
  closeLimit(order: LimitOrder): Promise<BotOrder | null>;
  closeMarket(size: number, tag: string): Promise<BotOrder | null>;
  readonly direction: Direction;
  /** 這個方向的持倉；反方向或空倉回傳 0 */
  holding(): { averageCost: number; size: number };
  isOpening(order: BotOrder): boolean;
  openLimit(order: LimitOrder): Promise<BotOrder | null>;
  openMarket(order: MarketOpen): Promise<BotOrder | null>;
}

export const spotTrader = (context: StrategyContext<Ledger>): Trader => ({
  budget: () => context.ledger().quoteBalance,
  closeLimit: ({ price, size, tag }) =>
    context.placeOrder({ price, side: 'SELL', size, tag, type: 'LIMIT' }),
  closeMarket: (size, tag) =>
    context.placeOrder({ side: 'SELL', size, tag, type: 'MARKET' }),
  direction: 1,
  holding: () => {
    const { averageCost, position } = context.ledger();

    return { averageCost, size: position };
  },
  isOpening: ({ side }) => side === 'BUY',
  openLimit: ({ price, size, tag }) =>
    context.placeOrder({ price, side: 'BUY', size, tag, type: 'LIMIT' }),
  openMarket: ({ amount, tag }) =>
    context.placeOrder({ amount, side: 'BUY', tag, type: 'MARKET' }),
});

export const futuresTrader = (
  context: StrategyContext<FuturesLedger>,
  direction: Direction,
  leverage: number,
): Trader => {
  const openSide = direction > 0 ? 'BUY' : 'SELL';
  const closeSide = direction > 0 ? 'SELL' : 'BUY';

  return {
    budget: () => {
      const { entryPrice, marginBalance, position } = context.ledger();

      return Math.max(
        0,
        (marginBalance - (Math.abs(position) * entryPrice) / leverage) *
          leverage,
      );
    },
    closeLimit: ({ price, size, tag }) =>
      context.placeOrder({ price, side: closeSide, size, tag, type: 'LIMIT' }),
    closeMarket: (size, tag) =>
      context.placeOrder({ side: closeSide, size, tag, type: 'MARKET' }),
    direction,
    holding: () => {
      const { entryPrice, position } = context.ledger();

      return position * direction > 0
        ? { averageCost: entryPrice, size: Math.abs(position) }
        : { averageCost: 0, size: 0 };
    },
    isOpening: ({ side }) => side === openSide,
    openLimit: ({ price, size, tag }) =>
      context.placeOrder({ price, side: openSide, size, tag, type: 'LIMIT' }),
    openMarket: async ({ amount, tag }) => {
      const price = context.lastPrice();
      if (!price) return null;

      return context.placeOrder({
        side: openSide,
        size: amount / price,
        tag,
        type: 'MARKET',
      });
    },
  };
};

/** 對持倉有利的方向：做多是往上、做空是往下 */
export const favorable = (
  direction: Direction,
  price: number,
  target: number,
) => (direction > 0 ? price >= target : price <= target);

export const adverse = (direction: Direction, price: number, target: number) =>
  direction > 0 ? price <= target : price >= target;
