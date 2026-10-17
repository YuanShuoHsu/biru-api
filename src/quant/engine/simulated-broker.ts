import type { Broker, MatchedFill, SubmittedOrder } from './bot-session';
import type { BotFill, OrderSide } from './types';

export interface MarketQuote {
  /** 回傳成交均價；沒有報價或深度不足以成交全部數量時回傳 null */
  averagePrice(
    side: OrderSide,
    quantity: { amount?: number; size?: number },
  ): Promise<number | null>;
  lastPrice(): number | null;
}

// 模擬盤與回測共用的撮合：手續費扣法對齊 Pionex（買入扣基礎幣、賣出扣計價幣）
export class SimulatedBroker implements Broker {
  constructor(
    private readonly feeRate: number,
    private readonly quote: MarketQuote,
    private readonly now: () => number,
  ) {}

  async submit(order: SubmittedOrder): Promise<BotFill[]> {
    const last = this.quote.lastPrice();
    const marketable =
      order.type === 'MARKET' ||
      (last !== null &&
        order.price !== undefined &&
        (order.side === 'BUY' ? order.price >= last : order.price <= last));
    if (!marketable) return [];

    const price = await this.quote.averagePrice(order.side, {
      amount: order.type === 'MARKET' ? order.amount : undefined,
      size: order.size,
    });
    if (price === null) throw new Error('Insufficient liquidity');

    const size =
      order.type === 'MARKET' && order.side === 'BUY'
        ? (order.amount ?? 0) / price
        : (order.size ?? 0);

    Object.assign(order, {
      filledAmount: price * size,
      filledSize: size,
      status: 'filled',
    });

    return [this.fill(order, price, size)];
  }

  cancel(): Promise<void> {
    return Promise.resolve();
  }

  match(price: number, openOrders: SubmittedOrder[]): MatchedFill[] {
    return openOrders
      .filter(
        ({ price: limit, side, type }) =>
          type === 'LIMIT' &&
          limit !== undefined &&
          (side === 'BUY' ? price <= limit : price >= limit),
      )
      .map((order) => ({
        fill: this.fill(
          order,
          order.price ?? price,
          (order.size ?? 0) - order.filledSize,
        ),
        orderId: order.id,
      }));
  }

  private fill(order: SubmittedOrder, price: number, size: number): BotFill {
    return order.side === 'BUY'
      ? {
          fee: size * this.feeRate,
          feeAsset: 'base',
          orderId: order.id,
          price,
          side: 'BUY',
          size,
          time: this.now(),
        }
      : {
          fee: price * size * this.feeRate,
          feeAsset: 'quote',
          orderId: order.id,
          price,
          side: 'SELL',
          size,
          time: this.now(),
        };
  }
}

/** 逐檔吃單的成交均價；這些檔位吃不完全部數量時回傳 null */
export const walkDepth = (
  levels: [price: number, size: number][],
  { amount, size }: { amount?: number; size?: number },
): number | null => {
  let remainingSize = size ?? Infinity;
  let remainingAmount = amount ?? Infinity;
  let filledSize = 0;
  let filledAmount = 0;

  for (const [price, available] of levels) {
    const take = Math.min(available, remainingSize, remainingAmount / price);
    filledSize += take;
    filledAmount += take * price;
    remainingSize -= take;
    remainingAmount -= take * price;
    if (remainingSize <= 1e-12 || remainingAmount <= 1e-12)
      return filledAmount / filledSize;
  }

  return null;
};
