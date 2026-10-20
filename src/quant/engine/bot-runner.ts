import { Logger } from '@nestjs/common';

import type { QuantBot } from 'src/db/schema/quant';

import { type GridConfigDto, isFuturesBot } from '../dto/quant-bot.dto';
import type { QuantCandleDto } from '../dto/quant-market.dto';
import type { PionexKlineInterval } from '../pionex/pionex.types';

import type { SpotAccount } from './account';
import {
  type Broker,
  BotSession,
  type SessionStore,
  type SubmittedOrder,
} from './bot-session';
import { FuturesAccount, type FuturesLedger } from './futures-account';
import type { Ledger } from './ledger';
import type { PionexBroker } from './pionex-broker';
import type { PionexFuturesBroker } from './pionex-futures-broker';
import { createFuturesStrategy, createStrategy } from './strategies';
import type { AiAdvisor, AiDecision } from './strategies/ai.strategy';
import type { BotFill, SymbolSpec, WebhookSignal } from './types';

export interface RunnerDependencies {
  account: FuturesAccount | SpotAccount;
  advisor?: AiAdvisor;
  broker: Broker &
    Partial<Pick<PionexBroker, 'sync'> & Pick<PionexFuturesBroker, 'position'>>;
  candles: (
    interval: PionexKlineInterval,
    count: number,
  ) => Promise<QuantCandleDto[]>;
  fills: BotFill[];
  orders: SubmittedOrder[];
  spec: SymbolSpec;
  store: SessionStore;
}

// 只有指標與 AI 策略依賴收盤；其他策略也訂 1 分 K 才能拿到即時價格
export const candleIntervalOf = (bot: QuantBot): PionexKlineInterval =>
  bot.type === 'indicator' || bot.type === 'ai'
    ? ((bot.config as { interval: PionexKlineInterval }).interval ?? '1M')
    : '1M';

export class BotRunner {
  private readonly logger: Logger;
  private readonly session: BotSession<FuturesLedger> | BotSession<Ledger>;
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
    const { account } = dependencies;
    const { type } = bot;
    const common = {
      broker: dependencies.broker,
      candles: dependencies.candles,
      config: bot.config,
      fills: dependencies.fills,
      investment: bot.investment,
      maxDailyLoss: bot.maxDailyLoss ?? undefined,
      maxOrderAmount: bot.maxOrderAmount ?? undefined,
      now: () => Date.now(),
      orders: dependencies.orders,
      spec: dependencies.spec,
      store: {
        insertFill: async (fill: BotFill) => {
          if (fill.id) this.knownFillIds.add(fill.id);
          await store.insertFill(fill);
        },
        insertFunding: store.insertFunding.bind(store),
        insertOrder: store.insertOrder.bind(store),
        log: store.log.bind(store),
        nextClientOrderId: store.nextClientOrderId.bind(store),
        setStopped: store.setStopped.bind(store),
        updateOrder: store.updateOrder.bind(store),
      } satisfies SessionStore,
    };

    if (isFuturesBot(bot)) {
      if (!(account instanceof FuturesAccount))
        throw new Error('Futures bot requires a futures account');
      this.session = new BotSession<FuturesLedger>({
        ...common,
        account,
        createStrategy: (context) =>
          createFuturesStrategy(type, context, {
            advisor: dependencies.advisor,
          }),
      });
    } else {
      if (account instanceof FuturesAccount)
        throw new Error('Spot bot requires a spot account');
      this.session = new BotSession<Ledger>({
        ...common,
        account,
        createStrategy: (context) =>
          createStrategy(type, context, { advisor: dependencies.advisor }),
      });
    }
  }

  get isStopped() {
    return this.session.isStopped;
  }

  get isFutures() {
    return isFuturesBot(this.bot);
  }

  get isLive() {
    return this.bot.mode === 'live';
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

  handleMark(mark: number) {
    return this.session.handleMark(mark).catch(this.report);
  }

  handleFunding(rate: number, mark: number, time: number) {
    return this.session.handleFunding(rate, mark, time).catch(this.report);
  }

  handleSignal(signal: WebhookSignal) {
    return this.session.handleSignal(signal);
  }

  handleAiDecision(decision: AiDecision, meta: Record<string, unknown>) {
    return this.session.handleAiDecision(decision, meta);
  }

  stop(reason: string, closeModel?: GridConfigDto['closeModel']) {
    return this.session.stop(reason, { closeModel });
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
      if (broker.position)
        await this.session.verifyPosition(
          () => broker.position!(),
          () => (this.session.ledger as FuturesLedger).position,
          10 ** -this.dependencies.spec.sizePrecision / 2,
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
