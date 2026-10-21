import type { SubmittedOrder } from './bot-session.js';
import { equityOf, type Ledger, LedgerBook } from './ledger.js';
import type { BotFill, OrderRequest } from './types.js';

const BUDGET_TOLERANCE = 1e-9;

/** 機器人的資金帳：現貨是計價幣加基礎幣，合約是逐倉保證金加淨持倉 */
export interface AccountModel<L> {
  apply(fill: BotFill): void;
  equity(price: number): number;
  /** 超出這個機器人可動用的資金或部位時回傳原因 */
  rejection(
    request: OrderRequest,
    openOrders: readonly SubmittedOrder[],
    lastPrice: number | null,
  ): string | null;
  /** 這張單會減少既有部位（平倉方向） */
  reduces(request: OrderRequest): boolean;
  snapshot(): L;
}

// 只能動用這個機器人自己的投入資金與自己買進的部位
export class SpotAccount implements AccountModel<Ledger> {
  private readonly book: LedgerBook;

  constructor(investment: number, fills: readonly BotFill[] = []) {
    this.book = new LedgerBook(investment, fills);
  }

  apply(fill: BotFill) {
    this.book.apply(fill);
  }

  reduces({ side }: OrderRequest) {
    return side === 'SELL';
  }

  snapshot() {
    return this.book.snapshot();
  }

  equity(price: number) {
    return equityOf(this.book.snapshot(), price);
  }

  rejection(
    { amount = 0, price = 0, side, size = 0, type }: OrderRequest,
    openOrders: readonly SubmittedOrder[],
  ) {
    const ledger = this.book.snapshot();
    let reservedQuote = 0;
    let reservedBase = 0;

    for (const order of openOrders) {
      if (order.side === 'BUY')
        reservedQuote +=
          order.type === 'LIMIT'
            ? (order.price ?? 0) * ((order.size ?? 0) - order.filledSize)
            : (order.amount ?? 0) - order.filledAmount;
      else reservedBase += (order.size ?? 0) - order.filledSize;
    }

    if (side === 'SELL')
      return size > ledger.position - reservedBase + BUDGET_TOLERANCE
        ? 'insufficient_position'
        : null;

    const notional = type === 'MARKET' ? amount : size * price;

    return notional > ledger.quoteBalance - reservedQuote + BUDGET_TOLERANCE
      ? 'insufficient_budget'
      : null;
  }
}
