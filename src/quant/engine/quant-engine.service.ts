import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import { and, asc, eq, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  type QuantBot,
  quantBot,
  quantBotFill,
  quantBotOrder,
  quantEngineLease,
} from 'src/db/schema/quant';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { QuantAccountService } from '../account/quant-account.service';
import {
  QUANT_CANDLE_EVENT,
  QuantMarketStreamService,
  type QuantCandleEvent,
} from '../market/quant-market-stream.service';
import { QuantMarketService } from '../market/quant-market.service';
import {
  PIONEX_ACCOUNT_EVENT,
  PionexPrivateStreams,
  type PionexAccountEvent,
} from '../pionex/pionex-private-streams';
import {
  PIONEX_TRADES_EVENT,
  type PionexTradesEvent,
} from '../pionex/pionex-public-stream';
import { PionexRestClient } from '../pionex/pionex-rest.client';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service';
import { quantEnvironment } from '../quant-environment';

import { BotRunner, candleIntervalOf } from './bot-runner';
import { BotStore, toBotFill, toSubmittedOrder } from './bot-store';
import { MarketCacheService } from './market-cache.service';
import { PionexBroker } from './pionex-broker';
import { SimulatedBroker } from './simulated-broker';
import { toSymbolSpec } from './symbol-spec';
import type { WebhookSignal } from './types';

const LEASE_TICK_MS = 10_000;
const LEASE_TTL_MS = 30_000;
// 續約失敗到租約過期之間要留餘裕，否則兩台可能同時下單
const LEASE_SAFETY_MS = 10_000;
const LIVE_SYNC_EVERY_TICKS = 2;
const MAX_CANDLES_PER_REQUEST = 500;

interface ActiveRunner {
  releases: (() => void)[];
  runner: BotRunner;
}

// 本機、stage、正式環境共用資料庫，每個環境只能有一台伺服器執行機器人
@Injectable()
export class QuantEngineService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(QuantEngineService.name);
  private readonly holderId = randomUUID();
  private readonly runners = new Map<string, ActiveRunner>();
  private readonly starting = new Set<string>();
  private leaseValidUntil = 0;
  private timer: NodeJS.Timeout | null = null;
  private ticks = 0;
  private ticking = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly account: QuantAccountService,
    private readonly eventEmitter: EventEmitter2,
    private readonly marketCache: MarketCacheService,
    private readonly market: QuantMarketService,
    private readonly marketStream: QuantMarketStreamService,
    private readonly privateStreams: PionexPrivateStreams,
    private readonly rest: PionexRestClient,
    private readonly symbols: PionexSymbolsService,
  ) {}

  onApplicationBootstrap() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), LEASE_TICK_MS);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.detachAll();
    await this.db
      .update(quantEngineLease)
      .set({ expiresAt: new Date() })
      .where(eq(quantEngineLease.holderId, this.holderId))
      .catch(() => undefined);
  }

  get hasLease() {
    return Date.now() < this.leaseValidUntil - LEASE_SAFETY_MS;
  }

  /** 使用者按停止：本機有在跑就立即停；不在本機則由持有租約的那台在下次巡檢時停 */
  async stopRunner(botId: string, reason: string) {
    const active = this.runners.get(botId);
    if (!active) return false;

    await active.runner.stop(reason);
    this.detach(botId);

    return true;
  }

  async signal(botId: string, signal: WebhookSignal) {
    const active = this.runners.get(botId);
    if (!active) throw new ServiceUnavailableException('Bot is not running');

    await active.runner.handleSignal(signal);
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;

    try {
      if (!(await this.renewLease())) return this.detachAll();

      await this.reconcileRunners();
      if (++this.ticks % LIVE_SYNC_EVERY_TICKS === 0)
        for (const { runner } of this.runners.values()) void runner.sync();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.stack : String(error));
    } finally {
      this.ticking = false;
    }
  }

  private async renewLease() {
    const environment = quantEnvironment();
    const expiresAt = new Date(Date.now() + LEASE_TTL_MS);

    const [lease] = await this.db
      .insert(quantEngineLease)
      .values({ environment, expiresAt, holderId: this.holderId })
      .onConflictDoUpdate({
        set: { expiresAt, holderId: this.holderId },
        target: quantEngineLease.environment,
        where: or(
          eq(quantEngineLease.holderId, this.holderId),
          lt(quantEngineLease.expiresAt, sql`now()`),
        ),
      })
      .returning({ holderId: quantEngineLease.holderId });

    const held = lease?.holderId === this.holderId;
    this.leaseValidUntil = held ? expiresAt.getTime() : 0;

    return held;
  }

  private async reconcileRunners() {
    const running = await this.db.query.quantBot.findMany({
      orderBy: asc(quantBot.createdAt),
      where: and(
        eq(quantBot.environment, quantEnvironment()),
        eq(quantBot.status, 'running'),
      ),
    });
    const selfManaged = running.filter(
      (bot) => !(bot.mode === 'live' && bot.type === 'grid'),
    );
    const runningIds = new Set(selfManaged.map(({ id }) => id));

    for (const [botId, { runner }] of this.runners)
      if (!runningIds.has(botId) || runner.isStopped) {
        if (!runner.isStopped) await runner.stop('stopped_by_user');
        this.detach(botId);
      }

    for (const bot of selfManaged)
      if (!this.runners.has(bot.id) && !this.starting.has(bot.id))
        void this.attach(bot);
  }

  private async attach(bot: QuantBot) {
    this.starting.add(bot.id);
    const releases: (() => void)[] = [];

    try {
      const spec = toSymbolSpec(await this.symbols.get(bot.symbol));
      const [orders, fills] = await Promise.all([
        this.db.query.quantBotOrder.findMany({
          orderBy: asc(quantBotOrder.createdAt),
          where: eq(quantBotOrder.botId, bot.id),
        }),
        this.db.query.quantBotFill.findMany({
          orderBy: asc(quantBotFill.filledAt),
          where: eq(quantBotFill.botId, bot.id),
        }),
      ]);

      const credentials =
        bot.mode === 'live' && bot.credentialId
          ? await this.account.resolveCredentials(bot.userId, bot.credentialId)
          : null;
      if (bot.mode === 'live' && !credentials)
        throw new Error('Live bot has no credential');

      const broker = credentials
        ? new PionexBroker(this.rest, credentials, spec, () => this.hasLease)
        : new SimulatedBroker(
            bot.paperFeeRate ?? 0,
            {
              averagePrice: (side, quantity) =>
                this.marketCache.averagePrice(bot.symbol, side, quantity),
              lastPrice: () => this.marketCache.lastPrice(bot.symbol),
            },
            () => Date.now(),
          );

      const runner = new BotRunner(bot, {
        broker,
        candles: (interval, count) =>
          this.market.findCandles(
            bot.symbol,
            interval,
            Math.min(count, MAX_CANDLES_PER_REQUEST),
          ),
        fills: fills.map((fill) => toBotFill(fill, spec)),
        orders: orders.map(toSubmittedOrder),
        spec,
        store: new BotStore(this.db, this.eventEmitter, bot, spec),
      });

      releases.push(
        await this.marketStream.watch(bot.symbol, candleIntervalOf(bot)),
      );
      if (credentials && bot.credentialId)
        releases.push(
          this.privateStreams.watch(
            bot.credentialId,
            credentials,
            bot.symbol,
            'SPOT',
          ),
        );

      const price =
        this.marketCache.lastPrice(bot.symbol) ??
        (await this.market.findCandles(bot.symbol, '1M', 1))[0]?.close;
      if (price === undefined) throw new Error('No market price available');
      this.marketCache.setLastPrice(bot.symbol, price);

      this.runners.set(bot.id, { releases, runner });
      await runner.start(price);
    } catch (error) {
      releases.forEach((release) => release());
      this.runners.delete(bot.id);
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Bot ${bot.id} failed to start: ${reason}`);
      await this.db
        .update(quantBot)
        .set({ status: 'error', statusReason: reason, stoppedAt: new Date() })
        .where(eq(quantBot.id, bot.id));
    } finally {
      this.starting.delete(bot.id);
    }
  }

  private detach(botId: string) {
    this.runners.get(botId)?.releases.forEach((release) => release());
    this.runners.delete(botId);
  }

  // 失去租約時只是放手，不撤單也不改狀態，交給拿到租約的那台接手
  private detachAll() {
    for (const botId of [...this.runners.keys()]) this.detach(botId);
  }

  @OnEvent(PIONEX_TRADES_EVENT)
  handleTrades({ symbol, trades }: PionexTradesEvent) {
    if (!this.hasLease || !trades.length) return;

    const prices = [...trades]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ price }) => Number(price));
    const last = prices.at(-1)!;
    // 同一批成交可能先穿越掛單價又回來，模擬撮合要看到這批的高低點
    const path =
      prices.length > 1
        ? [Math.min(...prices), Math.max(...prices), last]
        : [last];

    for (const { runner } of this.runners.values())
      if (runner.symbol === symbol)
        void (async () => {
          for (const price of path) await runner.handlePrice(price);
        })();
  }

  @OnEvent(QUANT_CANDLE_EVENT)
  handleCandle({ candle, interval, symbol }: QuantCandleEvent) {
    if (!this.hasLease) return;

    for (const { runner } of this.runners.values())
      if (runner.symbol === symbol && candleIntervalOf(runner.bot) === interval)
        runner.handleCandle(candle);
  }

  @OnEvent(PIONEX_ACCOUNT_EVENT)
  handleAccount({ credentialId, market, symbol }: PionexAccountEvent) {
    if (!this.hasLease || market !== 'SPOT') return;

    for (const { runner } of this.runners.values())
      if (
        runner.credentialId === credentialId &&
        (!symbol || runner.symbol === symbol)
      )
        void runner.sync();
  }
}
