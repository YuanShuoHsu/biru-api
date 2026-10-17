import { Logger } from '@nestjs/common';

import type { QuantBot } from 'src/db/schema/quant';

import type { QuantCandleDto } from '../dto/quant-market.dto';
import type { PionexKlineInterval } from '../pionex/pionex.types';

import {
  type Broker,
  BotSession,
  type SessionStore,
  type SubmittedOrder,
} from './bot-session';
import type { PionexBroker } from './pionex-broker';
import { createStrategy } from './strategies';
import type {
  BotFill,
  StrategyContext,
  SymbolSpec,
  WebhookSignal,
} from './types';

export interface RunnerDependencies {
  broker: Broker & Partial<Pick<PionexBroker, 'sync'>>;
  candles: (
    interval: PionexKlineInterval,
    count: number,
  ) => Promise<QuantCandleDto[]>;
  fills: BotFill[];
  orders: SubmittedOrder[];
  spec: SymbolSpec;
  store: SessionStore;
}

// 只有指標策略依賴收盤；其他策略也訂 1 分 K 才能拿到即時價格
export const candleIntervalOf = (bot: QuantBot): PionexKlineInterval =>
  bot.type === 'indicator'
    ? ((bot.config as { interval: PionexKlineInterval }).interval ?? '1M')
    : '1M';

export class BotRunner {
  private readonly logger: Logger;
  private readonly session: BotSession;
  private readonly knownFillIds: Set<string>;
  private lastCandle: QuantCandleDto | null = null;
  private syncing = false;

  constructor(
    readonly bot: QuantBot,
    private readonly dependencies: RunnerDependencies,
  ) {
    this.logger = new Logger(`${BotRunner.name}:${bot.id}`);
    const { store } = dependencies;
    this.knownFillIds = new Set(
      dependencies.fills.flatMap(({ id }) => (id ? [id] : [])),
    );
    this.session = new BotSession({
      broker: dependencies.broker,
      candles: dependencies.candles,
      config: bot.config,
      createStrategy: (context: StrategyContext) =>
        createStrategy(bot.type, context),
      fills: dependencies.fills,
      investment: bot.investment,
      maxDailyLoss: bot.maxDailyLoss ?? undefined,
      now: () => Date.now(),
      orders: dependencies.orders,
      spec: dependencies.spec,
      store: {
        insertFill: async (fill) => {
          if (fill.id) this.knownFillIds.add(fill.id);
          await store.insertFill(fill);
        },
        insertOrder: (order) => store.insertOrder(order),
        log: (kind, payload) => store.log(kind, payload),
        nextClientOrderId: () => store.nextClientOrderId(),
        setStopped: (reason, error) => store.setStopped(reason, error),
        updateOrder: (order) => store.updateOrder(order),
      },
    });
  }

  get isStopped() {
    return this.session.isStopped;
  }

  get symbol() {
    return this.bot.symbol;
  }

  get credentialId() {
    return this.bot.credentialId;
  }

  async start(price: number) {
    await this.session.handlePrice(price);
    await this.sync();
    await this.session.start();
  }

  handlePrice(price: number) {
    return this.session.handlePrice(price).catch(this.report);
  }

  /** K 線推播每次都帶當根；時間往前跳代表上一根已收盤 */
  handleCandle(candle: QuantCandleDto) {
    const previous = this.lastCandle;
    this.lastCandle = candle;
    if (previous && candle.time > previous.time)
      void this.session.handleCandleClose(previous).catch(this.report);
  }

  handleSignal(signal: WebhookSignal) {
    return this.session.handleSignal(signal);
  }

  stop(reason: string) {
    return this.session.stop(reason);
  }

  /** 實盤：向交易所對帳未完成委託 */
  async sync() {
    const { broker } = this.dependencies;
    if (!broker.sync || this.syncing) return;

    this.syncing = true;
    try {
      await this.session.reconcile((order) =>
        broker.sync!(order, this.knownFillIds),
      );
    } catch (error) {
      this.report(error);
    } finally {
      this.syncing = false;
    }
  }

  private readonly report = (error: unknown) =>
    this.logger.error(error instanceof Error ? error.stack : String(error));
}
