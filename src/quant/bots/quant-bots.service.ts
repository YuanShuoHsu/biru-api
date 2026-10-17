import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { Interval } from '@nestjs/schedule';

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import {
  type QuantBot,
  quantBot,
  quantBotEvent,
  quantBotFill,
  quantBotOrder,
} from 'src/db/schema/quant';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import type { I18nTranslations } from 'src/generated/i18n.generated';

import { QuantAccountService } from '../account/quant-account.service';
import type {
  CreateQuantBotDto,
  CreateQuantBotResponseDto,
  DcaConfigDto,
  GridAiStrategyDto,
  GridConfigDto,
  IndicatorConditionDto,
  IndicatorConfigDto,
  QuantBotDto,
  QuantBotEventDto,
  QuantBotFillDto,
  QuantBotOrderDto,
  QuantBotSummaryDto,
  QuantBotType,
  WebhookConfigDto,
  WebhookSignalDto,
} from '../dto/quant-bot.dto';
import { toBotFill } from '../engine/bot-store';
import { equityOf, LedgerBook } from '../engine/ledger';
import { MarketCacheService } from '../engine/market-cache.service';
import { QuantEngineService } from '../engine/quant-engine.service';
import { dcaMaxInvestment } from '../engine/strategies/dca.strategy';
import { gridLines } from '../engine/strategies/grid.strategy';
import { toSymbolSpec } from '../engine/symbol-spec';
import type { SymbolSpec } from '../engine/types';
import { QuantMarketService } from '../market/quant-market.service';
import { PionexApiError } from '../pionex/pionex-rest.client';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service';
import { quantEnvironment } from '../quant-environment';

import { PIONEX_GRID_FINISHED, PionexGridService } from './pionex-grid.service';

const EVENT_LIMIT = 200;
const PIONEX_GRID_SYNC_MS = 30_000;
const WEBHOOK_TOKEN_BYTES = 24;

type ErrorKey = keyof I18nTranslations['common']['quant'];

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const optional = <T>(value: T | null) => value ?? undefined;

@Injectable()
export class QuantBotsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly account: QuantAccountService,
    private readonly engine: QuantEngineService,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly market: QuantMarketService,
    private readonly marketCache: MarketCacheService,
    private readonly pionexGrid: PionexGridService,
    private readonly symbols: PionexSymbolsService,
  ) {}

  private t(key: ErrorKey, args?: Record<string, unknown>) {
    return this.i18n.t(`common.quant.${key}`, {
      args,
      lang: I18nContext.current()?.lang,
    });
  }

  private invalid(key: ErrorKey, args?: Record<string, unknown>): never {
    throw new BadRequestException(this.t(key, args));
  }

  async list(userId: string): Promise<QuantBotDto[]> {
    const bots = await this.db.query.quantBot.findMany({
      orderBy: desc(quantBot.createdAt),
      where: and(
        eq(quantBot.userId, userId),
        eq(quantBot.environment, quantEnvironment()),
        isNull(quantBot.archivedAt),
      ),
    });

    return Promise.all(bots.map((bot) => this.toDto(bot)));
  }

  async findOne(userId: string, id: string): Promise<QuantBotDto> {
    return this.toDto(await this.owned(userId, id));
  }

  async create(
    userId: string,
    type: QuantBotType,
    dto: CreateQuantBotDto,
  ): Promise<CreateQuantBotResponseDto> {
    const spec = toSymbolSpec(await this.symbols.get(dto.symbol));

    if (dto.mode === 'paper' && dto.paperFeeRate === undefined)
      this.invalid('botPaperFeeRequired');
    if (dto.mode === 'live') {
      if (!dto.credentialId) this.invalid('botCredentialRequired');
      await this.account.resolveCredentials(userId, dto.credentialId);
    }
    this.validateConfig(type, dto, spec);

    const webhookToken =
      type === 'webhook'
        ? randomBytes(WEBHOOK_TOKEN_BYTES).toString('base64url')
        : undefined;

    const [bot] = await this.db
      .insert(quantBot)
      .values({
        config: dto.config as unknown as Record<string, unknown>,
        credentialId: dto.mode === 'live' ? dto.credentialId : null,
        environment: quantEnvironment(),
        id: randomUUID(),
        investment: dto.investment,
        maxDailyLoss: dto.maxDailyLoss,
        mode: dto.mode,
        name: dto.name,
        paperFeeRate: dto.mode === 'paper' ? dto.paperFeeRate : null,
        symbol: dto.symbol,
        type,
        userId,
        webhookTokenHash: webhookToken && hashToken(webhookToken),
      })
      .returning();

    return { ...(await this.toDto(bot)), webhookToken };
  }

  // 停止的機器人不能再啟動：掛單已撤、網格佈局已失效，要改參數請另建一個
  async start(userId: string, id: string): Promise<QuantBotDto> {
    const bot = await this.owned(userId, id);
    if (bot.startedAt) throw new ConflictException(this.t('botAlreadyStarted'));

    const pionexBotId =
      bot.mode === 'live' && bot.type === 'grid'
        ? await this.startPionexGrid(bot)
        : null;

    const [updated] = await this.db
      .update(quantBot)
      .set({
        pionexBotId,
        startedAt: new Date(),
        status: 'running',
        statusReason: null,
      })
      .where(eq(quantBot.id, bot.id))
      .returning();
    void this.engine.tick();

    return this.toDto(updated);
  }

  async stop(userId: string, id: string): Promise<QuantBotDto> {
    const bot = await this.owned(userId, id);

    return this.toDto(await this.stopBot(bot, 'stopped_by_user'));
  }

  async stopAll(userId: string): Promise<void> {
    const running = await this.db.query.quantBot.findMany({
      where: and(
        eq(quantBot.userId, userId),
        eq(quantBot.environment, quantEnvironment()),
        eq(quantBot.status, 'running'),
      ),
    });

    const results = await Promise.allSettled(
      running.map((bot) => this.stopBot(bot, 'stopped_all')),
    );
    const failed = results.filter(({ status }) => status === 'rejected');
    if (failed.length)
      throw new ConflictException(
        this.t('botStopAllPartial', { count: failed.length }),
      );
  }

  async archive(userId: string, id: string): Promise<void> {
    const bot = await this.owned(userId, id);
    if (bot.status === 'running')
      throw new ConflictException(this.t('botStillRunning'));

    await this.db
      .update(quantBot)
      .set({ archivedAt: new Date() })
      .where(eq(quantBot.id, bot.id));
  }

  async listOrders(userId: string, id: string): Promise<QuantBotOrderDto[]> {
    const bot = await this.owned(userId, id);
    const rows = await this.db.query.quantBotOrder.findMany({
      orderBy: desc(quantBotOrder.createdAt),
      where: eq(quantBotOrder.botId, bot.id),
    });

    return rows.map((row) => ({
      amount: optional(row.amount),
      createdAt: row.createdAt,
      fee: row.fee,
      filledAmount: row.filledAmount,
      filledSize: row.filledSize,
      id: row.id,
      price: optional(row.price),
      side: row.side,
      size: optional(row.size),
      status: row.status,
      tag: optional(row.tag),
      type: row.type,
    }));
  }

  async listFills(userId: string, id: string): Promise<QuantBotFillDto[]> {
    const bot = await this.owned(userId, id);
    const rows = await this.db.query.quantBotFill.findMany({
      orderBy: desc(quantBotFill.filledAt),
      where: eq(quantBotFill.botId, bot.id),
    });

    return rows.map(
      ({ fee, feeCoin, filledAt, id: fillId, orderId, price, side, size }) => ({
        fee,
        feeCoin,
        filledAt,
        id: fillId,
        orderId,
        price,
        side,
        size,
      }),
    );
  }

  async listEvents(userId: string, id: string): Promise<QuantBotEventDto[]> {
    const bot = await this.owned(userId, id);
    const rows = await this.db.query.quantBotEvent.findMany({
      limit: EVENT_LIMIT,
      orderBy: desc(quantBotEvent.createdAt),
      where: eq(quantBotEvent.botId, bot.id),
    });

    return rows.map(({ createdAt, id: eventId, kind, payload }) => ({
      createdAt,
      id: eventId,
      kind,
      payload: optional(payload),
    }));
  }

  async receiveWebhook(
    botId: string,
    { action, amount, id, token }: WebhookSignalDto,
  ) {
    const bot = await this.db.query.quantBot.findFirst({
      where: and(
        eq(quantBot.id, botId),
        eq(quantBot.environment, quantEnvironment()),
      ),
    });
    const expected = bot?.webhookTokenHash;
    const actual = hashToken(token);
    if (
      !bot ||
      !expected ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
    )
      throw new UnauthorizedException();
    if (bot.status !== 'running')
      throw new ConflictException(this.t('botNotRunning'));

    if (id) {
      const duplicate = await this.db.query.quantBotEvent.findFirst({
        columns: { id: true },
        where: and(
          eq(quantBotEvent.botId, bot.id),
          eq(quantBotEvent.kind, 'webhook_signal'),
          sql`${quantBotEvent.payload}->>'id' = ${id}`,
        ),
      });
      if (duplicate) return;
    }

    await this.db.insert(quantBotEvent).values({
      botId: bot.id,
      id: randomUUID(),
      kind: 'webhook_signal',
      payload: { action, amount, id },
    });
    await this.engine.signal(bot.id, { action, amount });
  }

  async gridAiStrategy(
    userId: string,
    credentialId: string,
    symbol: string,
  ): Promise<GridAiStrategyDto> {
    const spec = toSymbolSpec(await this.symbols.get(symbol));
    const credentials = await this.account.resolveCredentials(
      userId,
      credentialId,
    );
    const strategy = await this.withExchangeError(() =>
      this.pionexGrid.aiStrategy(credentials, spec),
    );

    return {
      annualized: Number(strategy.annualized),
      bottom: Number(strategy.low),
      maxDrawdown: Number(strategy.maxDrawDown),
      row: strategy.gridCount,
      top: Number(strategy.high),
    };
  }

  /** Pionex 內建網格可能因停損停利或資金不足自己結束，結束了就同步成停止 */
  @Interval(PIONEX_GRID_SYNC_MS)
  async syncPionexGrids() {
    if (!this.engine.hasLease) return;

    const bots = await this.db.query.quantBot.findMany({
      orderBy: asc(quantBot.createdAt),
      where: and(
        eq(quantBot.environment, quantEnvironment()),
        eq(quantBot.status, 'running'),
        eq(quantBot.mode, 'live'),
        eq(quantBot.type, 'grid'),
      ),
    });

    for (const bot of bots) {
      if (!bot.pionexBotId || !bot.credentialId) continue;

      const credentials = await this.account.resolveCredentials(
        bot.userId,
        bot.credentialId,
      );
      const order = await this.pionexGrid.get(credentials, bot.pionexBotId);
      if (order.buOrderData.status !== PIONEX_GRID_FINISHED) continue;

      await this.db
        .update(quantBot)
        .set({
          status: 'stopped',
          statusReason: order.buOrderData.reasonBy ?? 'pionex_finished',
          stoppedAt: new Date(),
        })
        .where(eq(quantBot.id, bot.id));
    }
  }

  private async owned(userId: string, id: string) {
    const bot = await this.db.query.quantBot.findFirst({
      where: and(
        eq(quantBot.id, id),
        eq(quantBot.userId, userId),
        eq(quantBot.environment, quantEnvironment()),
      ),
    });
    if (!bot) throw new NotFoundException(this.t('botNotFound'));

    return bot;
  }

  private async stopBot(bot: QuantBot, reason: string) {
    if (bot.status !== 'running') return bot;

    if (bot.mode === 'live' && bot.type === 'grid' && bot.pionexBotId)
      await this.withExchangeError(async () =>
        this.pionexGrid.cancel(
          await this.account.resolveCredentials(bot.userId, bot.credentialId!),
          bot.pionexBotId!,
          (bot.config as unknown as GridConfigDto).closeModel,
        ),
      );
    else if (await this.engine.stopRunner(bot.id, reason)) {
      const refreshed = await this.db.query.quantBot.findFirst({
        where: eq(quantBot.id, bot.id),
      });
      return refreshed ?? bot;
    }

    const [updated] = await this.db
      .update(quantBot)
      .set({ status: 'stopped', statusReason: reason, stoppedAt: new Date() })
      .where(eq(quantBot.id, bot.id))
      .returning();
    // 模擬盤的掛單只存在資料庫；實盤掛單由持有租約的伺服器在巡檢時撤銷
    if (bot.mode === 'paper')
      await this.db
        .update(quantBotOrder)
        .set({ status: 'canceled' })
        .where(
          and(
            eq(quantBotOrder.botId, bot.id),
            eq(quantBotOrder.status, 'open'),
          ),
        );

    return updated;
  }

  private async startPionexGrid(bot: QuantBot) {
    const spec = toSymbolSpec(await this.symbols.get(bot.symbol));
    const credentials = await this.account.resolveCredentials(
      bot.userId,
      bot.credentialId!,
    );

    const order = await this.withExchangeError(() =>
      this.pionexGrid.create(
        credentials,
        spec,
        bot.config as unknown as GridConfigDto,
        bot.investment,
        bot.name,
      ),
    );

    return order.buOrderId;
  }

  private async withExchangeError<T>(request: () => Promise<T>) {
    try {
      return await request();
    } catch (error) {
      if (!(error instanceof PionexApiError)) throw error;

      throw new BadRequestException(
        this.t('exchangeRejected', { message: error.message }),
      );
    }
  }

  private validateConfig(
    type: QuantBotType,
    dto: CreateQuantBotDto,
    spec: SymbolSpec,
  ) {
    const { investment } = dto;

    switch (type) {
      case 'grid': {
        const config = dto.config as GridConfigDto;
        if (config.top <= config.bottom) this.invalid('gridRangeInvalid');

        // 每格利潤小於來回手續費，網格每做一次就虧一次
        const lines = gridLines(config);
        const spacing = Math.min(
          ...lines.slice(1).map((line, index) => line / lines[index] - 1),
        );
        if (dto.paperFeeRate !== undefined && spacing <= dto.paperFeeRate * 2)
          this.invalid('gridSpacingTooSmall');

        const perGrid = investment / config.row;
        if (perGrid < spec.minAmount)
          this.invalid('gridInvestmentTooSmall', {
            min: spec.minAmount * config.row,
          });
        return;
      }
      case 'dca': {
        const max = dcaMaxInvestment(dto.config as DcaConfigDto);
        if (max > investment)
          this.invalid('dcaInvestmentTooSmall', { required: max });
        return;
      }
      case 'indicator': {
        const config = dto.config as IndicatorConfigDto;
        if (config.orderAmount > investment)
          this.invalid('orderAmountAboveInvestment');
        for (const condition of [...config.entry, ...config.exit])
          if (!this.conditionComplete(condition))
            this.invalid('indicatorConditionIncomplete');
        return;
      }
      case 'webhook': {
        if ((dto.config as WebhookConfigDto).orderAmount > investment)
          this.invalid('orderAmountAboveInvestment');
        return;
      }
    }
  }

  private conditionComplete(condition: IndicatorConditionDto) {
    switch (condition.kind) {
      case 'rsi':
        return (
          condition.operator !== undefined && condition.value !== undefined
        );
      case 'maCross':
      case 'emaCross':
        return (
          condition.fast !== undefined &&
          condition.slow !== undefined &&
          condition.fast < condition.slow &&
          condition.direction !== undefined
        );
      case 'macdCross':
        return condition.direction !== undefined;
      case 'bollinger':
        return condition.band !== undefined;
    }
  }

  private async summary(bot: QuantBot): Promise<QuantBotSummaryDto> {
    if (bot.mode === 'live' && bot.type === 'grid')
      return this.pionexGridSummary(bot);

    const spec = toSymbolSpec(await this.symbols.get(bot.symbol));
    const fills = await this.db.query.quantBotFill.findMany({
      orderBy: asc(quantBotFill.filledAt),
      where: eq(quantBotFill.botId, bot.id),
    });
    const ledger = new LedgerBook(
      bot.investment,
      fills.map((fill) => toBotFill(fill, spec)),
    ).snapshot();
    const price =
      this.marketCache.lastPrice(bot.symbol) ??
      (await this.market.findCandles(bot.symbol, '1M', 1))[0]?.close ??
      0;
    const equity = equityOf(ledger, price);

    return {
      averageCost: ledger.averageCost,
      equity,
      fillCount: fills.length,
      pnl: equity - bot.investment,
      position: ledger.position,
      realizedPnl: ledger.realizedPnl,
    };
  }

  private async pionexGridSummary(bot: QuantBot): Promise<QuantBotSummaryDto> {
    const empty = {
      averageCost: 0,
      equity: bot.investment,
      fillCount: 0,
      pnl: 0,
      position: 0,
      realizedPnl: 0,
    };
    if (!bot.pionexBotId || !bot.credentialId) return empty;

    try {
      const { buOrderData: data } = await this.pionexGrid.get(
        await this.account.resolveCredentials(bot.userId, bot.credentialId),
        bot.pionexBotId,
      );
      const price =
        this.marketCache.lastPrice(bot.symbol) ??
        (await this.market.findCandles(bot.symbol, '1M', 1))[0]?.close ??
        0;
      const position = Number(data.baseAmount ?? 0);
      const equity = Number(data.quoteAmount ?? 0) + position * price;

      return {
        averageCost: Number(data.averageCost ?? 0),
        equity,
        fillCount: 0,
        pnl: equity - bot.investment,
        position,
        realizedPnl: Number(data.gridProfit ?? 0),
      };
    } catch {
      return empty;
    }
  }

  private async toDto(bot: QuantBot): Promise<QuantBotDto> {
    return {
      config: bot.config as unknown as QuantBotDto['config'],
      createdAt: bot.createdAt,
      credentialId: optional(bot.credentialId),
      id: bot.id,
      investment: bot.investment,
      maxDailyLoss: optional(bot.maxDailyLoss),
      mode: bot.mode,
      name: bot.name,
      paperFeeRate: optional(bot.paperFeeRate),
      pionexBotId: optional(bot.pionexBotId),
      startedAt: optional(bot.startedAt),
      status: bot.status,
      statusReason: optional(bot.statusReason),
      stoppedAt: optional(bot.stoppedAt),
      summary: await this.summary(bot),
      symbol: bot.symbol,
      type: bot.type,
    };
  }
}
