import { randomUUID } from 'node:crypto';

import type { QuantCandleDto } from '../dto/quant-market.dto';
import type { PionexKlineInterval } from '../pionex/pionex.types';

import { equityOf, type Ledger, LedgerBook } from './ledger';
import { floorTo, roundTo } from './precision';
import type {
  BotFill,
  BotOrder,
  OrderRequest,
  Strategy,
  StrategyContext,
  SymbolSpec,
  WebhookSignal,
} from './types';

const BUDGET_TOLERANCE = 1e-9;

export interface SubmittedOrder extends BotOrder {
  clientOrderId: string;
  exchangeOrderId?: string;
}

export interface MatchedFill {
  fill: BotFill;
  orderId: string;
}

/** 下單的實際去處：模擬撮合或 Pionex */
export interface Broker {
  cancel(order: SubmittedOrder): Promise<void>;
  /** 只有模擬撮合需要：價格變動時成交被穿越的限價單 */
  match?(price: number, openOrders: SubmittedOrder[]): MatchedFill[];
  /** 立即成交時回傳成交，並把成交數量與狀態寫回 order；其餘成交由之後的撮合或對帳帶回 */
  submit(order: SubmittedOrder): Promise<BotFill[]>;
}

/** 狀態寫到哪裡：資料庫（模擬盤、實盤）或記憶體（回測） */
export interface SessionStore {
  insertFill(fill: BotFill): Promise<void>;
  insertOrder(order: SubmittedOrder): Promise<void>;
  log(kind: string, payload?: Record<string, unknown>): void;
  nextClientOrderId(): Promise<string>;
  setStopped(reason: string, error: boolean): Promise<void>;
  updateOrder(order: SubmittedOrder): Promise<void>;
}

export interface SessionOptions {
  broker: Broker;
  candles: (
    interval: PionexKlineInterval,
    count: number,
  ) => Promise<QuantCandleDto[]>;
  config: unknown;
  createStrategy: (context: StrategyContext) => Strategy;
  fills: BotFill[];
  investment: number;
  maxDailyLoss?: number;
  now: () => number;
  orders: SubmittedOrder[];
  spec: SymbolSpec;
  store: SessionStore;
}

const dayOf = (time: number) => Math.floor(time / 86_400_000);

export class BotSession {
  private readonly orders = new Map<string, SubmittedOrder>();
  private readonly fills: BotFill[];
  private readonly ledgerBook: LedgerBook;
  private readonly strategy: Strategy;
  private price: number | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private dayStart: { day: number; equity: number } | null = null;

  constructor(private readonly options: SessionOptions) {
    for (const order of options.orders) this.orders.set(order.id, order);
    this.fills = [...options.fills];
    this.ledgerBook = new LedgerBook(options.investment, this.fills);
    this.strategy = options.createStrategy(this.context());
  }

  get isStopped() {
    return this.stopped;
  }

  get ledger(): Ledger {
    return this.ledgerBook.snapshot();
  }

  get lastPrice() {
    return this.price;
  }

  openOrders(): SubmittedOrder[] {
    return [...this.orders.values()].filter(({ status }) => status === 'open');
  }

  findOrder(id: string) {
    return this.orders.get(id);
  }

  start() {
    return this.serialize(() => this.strategy.start());
  }

  handlePrice(price: number) {
    return this.serialize(async () => {
      this.price = price;
      if (this.stopped) return;

      for (const { fill, orderId } of this.options.broker.match?.(
        price,
        this.openOrders(),
      ) ?? []) {
        const order = this.orders.get(orderId);
        if (!order) continue;

        await this.recordFill(orderId, fill, {
          filledAmount: order.filledAmount + fill.price * fill.size,
          filledSize: order.filledSize + fill.size,
          status: 'filled',
        });
        if (this.stopped) return;
      }

      await this.checkDailyLoss(price);
      if (this.stopped) return;

      await this.strategy.onPrice?.(price);
    });
  }

  handleCandleClose(candle: QuantCandleDto) {
    return this.serialize(async () => {
      if (!this.stopped) await this.strategy.onCandleClose?.(candle);
    });
  }

  handleSignal(signal: WebhookSignal) {
    return this.serialize(async () => {
      if (!this.stopped) await this.strategy.onSignal?.(signal);
    });
  }

  /**
   * 實盤對帳：和策略動作排在同一個佇列，機器人自己撤單時不會被誤判成外部撤銷。
   * 交易所回報已撤銷、但本地仍是掛單中，代表被使用者在 Pionex 手動撤掉，機器人停止。
   */
  reconcile(
    syncOrder: (
      order: SubmittedOrder,
    ) => Promise<{ fills: BotFill[]; order: Partial<SubmittedOrder> }>,
  ) {
    return this.serialize(async () => {
      for (const order of this.openOrders()) {
        const { fills, order: update } = await syncOrder(order);

        for (const fill of fills) await this.recordFill(order.id, fill, update);
        if (!fills.length) {
          Object.assign(order, update);
          await this.options.store.updateOrder(order);
        }

        if (update.status === 'canceled')
          return this.halt('order_canceled_externally', true, false);
      }
    });
  }

  stop(reason: string, { error = false, closePosition = true } = {}) {
    return this.serialize(() => this.halt(reason, error, closePosition));
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch((error: unknown) =>
      this.halt(
        error instanceof Error ? error.message : String(error),
        true,
        false,
      ),
    );

    return run;
  }

  private async halt(reason: string, error: boolean, closePosition: boolean) {
    if (this.stopped) return;

    await this.cancelAll();
    if (closePosition) await this.strategy.stop?.();
    this.stopped = true;
    await this.cancelAll();
    await this.options.store.setStopped(reason, error);
    this.options.store.log(error ? 'error' : 'stopped', { reason });
  }

  private async checkDailyLoss(price: number) {
    const { maxDailyLoss, now } = this.options;
    if (maxDailyLoss === undefined) return;

    const day = dayOf(now());
    const equity = equityOf(this.ledger, price);
    if (this.dayStart?.day !== day) this.dayStart = { day, equity };

    if (this.dayStart.equity - equity >= maxDailyLoss)
      await this.halt('daily_loss_limit', false, false);
  }

  private async recordFill(
    orderId: string,
    fill: BotFill,
    orderUpdate: Partial<BotOrder>,
  ) {
    const order = this.orders.get(orderId);
    if (!order) return;

    Object.assign(order, orderUpdate);
    this.fills.push(fill);
    this.ledgerBook.apply(fill);
    await this.options.store.insertFill(fill);
    await this.options.store.updateOrder(order);

    if (!this.stopped) await this.strategy.onFill?.(order, fill);
  }

  private async cancelAll() {
    for (const order of this.openOrders()) {
      await this.options.broker.cancel(order);
      order.status = 'canceled';
      await this.options.store.updateOrder(order);
    }
  }

  private reserved() {
    let quote = 0;
    let base = 0;

    for (const order of this.openOrders()) {
      if (order.side === 'BUY')
        quote +=
          order.type === 'LIMIT'
            ? (order.price ?? 0) * ((order.size ?? 0) - order.filledSize)
            : (order.amount ?? 0) - order.filledAmount;
      else base += (order.size ?? 0) - order.filledSize;
    }

    return { base, quote };
  }

  private normalize(request: OrderRequest): OrderRequest {
    const { spec } = this.options;

    return {
      ...request,
      amount:
        request.amount === undefined
          ? undefined
          : floorTo(request.amount, spec.amountPrecision),
      price:
        request.price === undefined
          ? undefined
          : roundTo(request.price, spec.pricePrecision),
      size:
        request.size === undefined
          ? undefined
          : floorTo(request.size, spec.sizePrecision),
    };
  }

  // 風控：只能動用這個機器人自己的投入資金與自己買進的部位
  private rejection(request: OrderRequest): string | null {
    const { spec } = this.options;
    const { amount = 0, price = 0, side, size = 0, type } = request;

    if (type === 'LIMIT' && !(price > 0)) return 'invalid_price';

    const notional =
      type === 'MARKET' && side === 'BUY'
        ? amount
        : size * (type === 'LIMIT' ? price : (this.price ?? 0));

    if (type === 'MARKET' && side === 'BUY') {
      if (amount < spec.minAmount) return 'below_minimum';
    } else {
      if (size < spec.minTradeSize) return 'below_minimum';
      if (size > spec.maxTradeSize) return 'above_maximum';
      if (notional < spec.minAmount) return 'below_minimum';
    }

    const ledger = this.ledger;
    const reserved = this.reserved();

    if (side === 'BUY') {
      const available = ledger.quoteBalance - reserved.quote;
      if (notional > available + BUDGET_TOLERANCE) return 'insufficient_budget';
    } else {
      const available = ledger.position - reserved.base;
      if (size > available + BUDGET_TOLERANCE) return 'insufficient_position';
    }

    return null;
  }

  private async placeOrder(request: OrderRequest): Promise<BotOrder | null> {
    if (this.stopped) return null;

    const normalized = this.normalize(request);
    const reason = this.rejection(normalized);
    if (reason) {
      this.options.store.log('order_skipped', { reason, request: normalized });
      return null;
    }

    const order: SubmittedOrder = {
      ...normalized,
      clientOrderId: await this.options.store.nextClientOrderId(),
      filledAmount: 0,
      filledSize: 0,
      id: randomUUID(),
      status: 'open',
    };
    this.orders.set(order.id, order);
    await this.options.store.insertOrder(order);

    try {
      const fills = await this.options.broker.submit(order);
      await this.options.store.updateOrder(order);
      for (const fill of fills) await this.recordFill(order.id, fill, {});
    } catch (error) {
      order.status = 'rejected';
      await this.options.store.updateOrder(order);
      this.options.store.log('order_rejected', {
        message: error instanceof Error ? error.message : String(error),
        request: normalized,
      });
      return null;
    }

    return order;
  }

  private context(): StrategyContext {
    const { candles, config, investment, now, spec, store } = this.options;

    return {
      cancelAll: () => this.cancelAll(),
      cancelOrder: async (orderId) => {
        const order = this.orders.get(orderId);
        if (order?.status !== 'open') return;

        await this.options.broker.cancel(order);
        order.status = 'canceled';
        await store.updateOrder(order);
      },
      candles,
      config,
      fills: () => this.fills,
      findOrder: (orderId) => this.orders.get(orderId),
      investment,
      lastPrice: () => this.price,
      ledger: () => this.ledger,
      log: (kind, payload) => store.log(kind, payload),
      now,
      openOrders: () => this.openOrders(),
      placeOrder: (request) => this.placeOrder(request),
      spec,
      // 策略自己決定要停時（例如觸發停損）已經在 serialize 佇列裡，不能再排一次
      stop: (reason) => this.halt(reason, false, true),
    };
  }
}
