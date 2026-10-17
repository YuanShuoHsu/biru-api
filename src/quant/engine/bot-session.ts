import { randomUUID } from 'node:crypto';

import type { QuantCandleDto } from '../dto/quant-market.dto';
import type { PionexKlineInterval } from '../pionex/pionex.types';

import type { AccountModel } from './account';
import type { FundingPayment } from './futures-account';
import type { Ledger } from './ledger';
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
  insertFunding(payment: FundingPayment & { rate: number }): Promise<void>;
  insertOrder(order: SubmittedOrder): Promise<void>;
  log(kind: string, payload?: Record<string, unknown>): void;
  nextClientOrderId(): Promise<string>;
  setStopped(reason: string, error: boolean): Promise<void>;
  updateOrder(order: SubmittedOrder): Promise<void>;
}

/** 合約帳才有強平與資金費 */
export interface FuturesHooks {
  addFunding(amount: number): void;
  fundingAmount(rate: number, mark: number): number;
  liquidation(mark: number, time: number): BotFill | null;
}

export interface SessionOptions<L = Ledger> {
  account: AccountModel<L> & Partial<FuturesHooks>;
  broker: Broker;
  candles: (
    interval: PionexKlineInterval,
    count: number,
  ) => Promise<QuantCandleDto[]>;
  config: unknown;
  createStrategy: (context: StrategyContext<L>) => Strategy;
  fills: BotFill[];
  investment: number;
  maxDailyLoss?: number;
  now: () => number;
  orders: SubmittedOrder[];
  spec: SymbolSpec;
  store: SessionStore;
}

const dayOf = (time: number) => Math.floor(time / 86_400_000);

export class BotSession<L = Ledger> {
  private readonly orders = new Map<string, SubmittedOrder>();
  private readonly fills: BotFill[];
  private readonly strategy: Strategy;
  private price: number | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private dayStart: { day: number; equity: number } | null = null;

  constructor(private readonly options: SessionOptions<L>) {
    for (const order of options.orders) this.orders.set(order.id, order);
    this.fills = [...options.fills];
    this.strategy = options.createStrategy(this.context());
  }

  get isStopped() {
    return this.stopped;
  }

  get ledger(): L {
    return this.options.account.snapshot();
  }

  equity(price: number) {
    return this.options.account.equity(price);
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

  /** 以標記價格檢查強平；觸及就以標記價格平倉並停止，不再跑策略的收尾 */
  handleMark(mark: number) {
    return this.serialize(async () => {
      const fill = this.options.account.liquidation?.(mark, this.options.now());
      if (this.stopped || !fill) return;

      await this.cancelAll();
      const order: SubmittedOrder = {
        clientOrderId: await this.options.store.nextClientOrderId(),
        filledAmount: fill.price * fill.size,
        filledSize: fill.size,
        id: randomUUID(),
        side: fill.side,
        size: fill.size,
        status: 'filled',
        tag: 'liquidation',
        type: 'MARKET',
      };
      this.orders.set(order.id, order);
      await this.options.store.insertOrder(order);
      await this.recordFill(order.id, { ...fill, orderId: order.id }, {});
      await this.halt('liquidated', false, false);
    });
  }

  handleFunding(rate: number, mark: number, time: number) {
    return this.serialize(async () => {
      const { account, store } = this.options;
      const amount = account.fundingAmount?.(rate, mark) ?? 0;
      if (this.stopped || amount === 0) return;

      account.addFunding?.(amount);
      await store.insertFunding({ amount, rate, time });
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
    const equity = this.options.account.equity(price);
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
    this.options.account.apply(fill);
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

  private rejection(request: OrderRequest): string | null {
    const { spec } = this.options;
    const { amount = 0, price = 0, size = 0, type } = request;

    if (type === 'LIMIT' && !(price > 0)) return 'invalid_price';

    // 現貨市價買單以金額下單，其餘（含合約市價單）都以數量下單
    const byAmount = type === 'MARKET' && request.amount !== undefined;
    const notional = byAmount
      ? amount
      : size * (type === 'LIMIT' ? price : (this.price ?? 0));

    if (byAmount) {
      if (amount < spec.minAmount) return 'below_minimum';
    } else {
      if (size < spec.minTradeSize) return 'below_minimum';
      if (size > spec.maxTradeSize) return 'above_maximum';
      if (notional < spec.minAmount) return 'below_minimum';
    }

    return this.options.account.rejection(
      request,
      this.openOrders(),
      this.price,
    );
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

  private context(): StrategyContext<L> {
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
      schedule: (task) =>
        this.serialize(async () => {
          if (!this.stopped) await task();
        }),
      spec,
      // 策略自己決定要停時（例如觸發停損）已經在 serialize 佇列裡，不能再排一次
      stop: (reason) => this.halt(reason, false, true),
    };
  }
}
