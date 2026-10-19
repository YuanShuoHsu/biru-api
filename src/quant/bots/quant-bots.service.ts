import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { Interval } from '@nestjs/schedule';

import {
  type Column,
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';
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
  quantBotEquity,
  quantBotEvent,
  quantBotFill,
  quantBotOrder,
} from 'src/db/schema/quant';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import type { I18nTranslations } from 'src/generated/i18n.generated';

import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';

import { QuantAccountService } from '../account/quant-account.service';
import { QuantAiAdvisorService } from '../ai/quant-ai-advisor.service';
import { QuantAiKeyService } from '../ai/quant-ai-key.service';
import {
  type AiConfigDto,
  type CreateQuantBotDto,
  type CreateQuantBotResponseDto,
  type DcaConfigDto,
  executorOf,
  type FuturesGridCheckDto,
  type FuturesGridCheckResultDto,
  type FuturesGridConfigDto,
  type FuturesGridOperationCheckDto,
  type FuturesGridOperationDto,
  type FuturesGridStopDto,
  type GridAiStrategyDto,
  type GridCheckDto,
  type GridCheckResultDto,
  type GridConfigDto,
  type GridOperationDto,
  type IndicatorConditionDto,
  type IndicatorConfigDto,
  futuresMarginOf,
  type FuturesPositionConfigDto,
  isFuturesBot,
  isFuturesBotType,
  ORDER_LIMIT_BOT_TYPES,
  QUANT_BOT_DATE_FILTER_FIELDS,
  QUANT_BOT_ENUM_FILTER_FIELDS,
  QUANT_BOT_NUMBER_FILTER_FIELDS,
  QUANT_BOT_STRING_FILTER_FIELDS,
  type QuantBotDto,
  type QuantBotEquityPointDto,
  type QuantBotEventDto,
  type QuantBotEventPaginationQueryDto,
  type QuantBotEventSortField,
  type QuantBotFillDto,
  type QuantBotFillMarkerDto,
  type QuantBotFillPaginationQueryDto,
  type QuantBotFillSortField,
  type QuantBotOrderDto,
  type QuantBotOrderPaginationQueryDto,
  type QuantBotOrderSortField,
  type QuantBotPaginationQueryDto,
  type QuantBotSummaryDto,
  type QuantBotType,
  type SendSignalDto,
  type SignalBotConfigDto,
  type SignalSetupDto,
  type WebhookConfigDto,
  type WebhookSignalDto,
} from '../dto/quant-bot.dto';
import { SpotAccount } from '../engine/account';
import { FUNDING_EVENT, toBotFill } from '../engine/bot-store';
import { FuturesAccount } from '../engine/futures-account';
import { toDecimalString } from '../engine/precision';
import { MarketCacheService } from '../engine/market-cache.service';
import { QuantEngineService } from '../engine/quant-engine.service';
import { dcaMaxInvestment } from '../engine/strategies/dca.strategy';
import { futuresGridQuantity } from '../engine/strategies/futures-grid.strategy';
import { gridLayout, gridLines } from '../engine/strategies/grid.strategy';
import {
  botSymbolSpec,
  toRiskTiers,
  toSymbolSpec,
} from '../engine/symbol-spec';
import type { SymbolSpec } from '../engine/types';
import { QuantMarketService } from '../market/quant-market.service';
import { PionexApiError } from '../pionex/pionex-rest.client';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service';
import { quantEnvironment } from '../quant-environment';

import {
  type FuturesGridOperationPath,
  futuresGridIdOf,
  type PionexFuturesGridData,
  type PionexFuturesGridOperationCheck,
  PionexFuturesGridService,
} from './pionex-futures-grid.service';
import {
  fromPionexSpotStop,
  fromPionexStop,
  PIONEX_GRID_FINISHED,
  PionexGridService,
  type PionexSpotGridData,
  toPionexStop,
} from './pionex-grid.service';
import {
  PionexSignalService,
  type SmartCopyParams,
} from './pionex-signal.service';

const PIONEX_GRID_SYNC_MS = 30_000;
const WEBHOOK_TOKEN_BYTES = 24;

const EQUITY_SAMPLE_MS = 5 * 60_000;
const EQUITY_MAX_POINTS = 1000;

const dayOf = (time: number) => Math.floor(time / 86_400_000);

const optionalNumber = (value?: string | number | null) =>
  value === undefined || value === null || value === '' || Number(value) === 0
    ? undefined
    : Number(value);

const toOperationCheck = (
  check?: PionexFuturesGridOperationCheck,
): FuturesGridOperationCheckDto => ({
  liquidationPriceDownAfter: optionalNumber(
    check?.estimateLiquidationPriceDownAfter,
  ),
  liquidationPriceDownBefore: optionalNumber(
    check?.estimateLiquidationPriceDownBefore ??
      check?.estimateLiquidationPriceDown,
  ),
  liquidationPriceUpAfter: optionalNumber(
    check?.estimateLiquidationPriceUpAfter,
  ),
  liquidationPriceUpBefore: optionalNumber(
    check?.estimateLiquidationPriceUpBefore ??
      check?.estimateLiquidationPriceUp,
  ),
  maxAmount: optionalNumber(check?.maxAmount),
  maxInvestment: optionalNumber(check?.maxInvestment),
  maxReduceNum: check?.maxReduceNum,
  minInvestment: optionalNumber(check?.minInvestment),
  // 有些試算端點成功時不回 data
  ok: check?.checkResult ?? true,
  perVolume: optionalNumber(check?.estimatePerVolume),
  reason: check?.reason,
  reduceAmount: optionalNumber(check?.reduceAmount),
  reducePnl: optionalNumber(check?.reducePnl),
});

type ErrorKey = keyof I18nTranslations['common']['quant'];

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const optional = <T>(value: T | null) => value ?? undefined;

@Injectable()
export class QuantBotsService {
  private readonly logger = new Logger(QuantBotsService.name);
  // 實盤 Pionex 合約機器人當天開始時的損益，用來判斷每日虧損上限；重啟後從當下重新起算
  private readonly dayStartPnl = new Map<
    string,
    { day: number; pnl: number }
  >();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly account: QuantAccountService,
    private readonly aiAdvisor: QuantAiAdvisorService,
    private readonly aiKeys: QuantAiKeyService,
    private readonly engine: QuantEngineService,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly market: QuantMarketService,
    private readonly marketCache: MarketCacheService,
    private readonly pionexFuturesGrid: PionexFuturesGridService,
    private readonly pionexGrid: PionexGridService,
    private readonly pionexSignal: PionexSignalService,
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

  async list(
    userId: string,
    query: QuantBotPaginationQueryDto = {},
  ): Promise<{ data: QuantBotDto[]; total: number }> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      sortBy,
      sortDirection = 'desc',
    } = query;

    // 建立後尚未啟動的機器人在資料庫是 stopped，畫面上顯示為 notStarted
    const status = sql`case when ${quantBot.startedAt} is null then 'notStarted' else ${quantBot.status}::text end`;
    // 畫面上的交易對寫成 BTC/USDT，篩選要比對看得到的字
    const pair = sql`replace(regexp_replace(${quantBot.symbol}, '_PERP$', ''), '_', '/')`;
    const executor = sql`case when ${quantBot.mode} = 'live' and ${quantBot.type} in ('grid', 'futures_grid', 'signal') then 'pionex' else 'engine' end`;
    const fieldMap: Record<string, Column | SQL> = {
      name: quantBot.name,
      symbol: pair,
      type: sql`${quantBot.type}::text`,
      executor,
      mode: sql`${quantBot.mode}::text`,
      status,
      investment: quantBot.investment,
      startedAt: quantBot.startedAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [dir(fieldMap[sortBy]), desc(quantBot.createdAt)]
      : [desc(quantBot.createdAt)];

    const where = and(
      eq(quantBot.userId, userId),
      eq(quantBot.environment, quantEnvironment()),
      isNull(quantBot.archivedAt),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            QUANT_BOT_STRING_FILTER_FIELDS,
            QUANT_BOT_DATE_FILTER_FIELDS,
            QUANT_BOT_ENUM_FILTER_FIELDS,
            QUANT_BOT_NUMBER_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: QUANT_BOT_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(quantBot.name, `%${value}%`),
          ilike(pair, `%${value}%`),
          ilike(sql`${quantBot.investment}::text`, `%${value}%`),
          ilike(localTimeText(quantBot.startedAt), `%${value}%`),
        ],
      }),
    );

    const [bots, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(quantBot)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(quantBot).where(where),
    ]);

    return {
      data: await Promise.all(bots.map((bot) => this.toDto(bot))),
      total,
    };
  }

  async findOne(userId: string, id: string): Promise<QuantBotDto> {
    return this.toDto(await this.owned(userId, id));
  }

  async create(
    userId: string,
    type: QuantBotType,
    dto: CreateQuantBotDto,
  ): Promise<CreateQuantBotResponseDto> {
    const spec = await botSymbolSpec(this.symbols, {
      config: dto.config,
      symbol: dto.symbol,
      type,
    });
    const isPerp = (await this.symbols.marketTypeOf(dto.symbol)) === 'PERP';
    const position = (dto.config as { futures?: FuturesPositionConfigDto })
      .futures;
    if (
      type === 'dca' ||
      type === 'indicator' ||
      type === 'webhook' ||
      type === 'ai'
    ) {
      if (isPerp !== !!position) this.invalid('futuresPositionMismatch');
      if (isPerp && dto.mode === 'live')
        this.invalid('futuresStrategyLiveNotReady');
    } else if (isPerp !== isFuturesBotType(type))
      throw new NotFoundException(`Unknown symbol ${dto.symbol}`);

    if (dto.mode === 'paper' && dto.paperFeeRate === undefined)
      this.invalid('botPaperFeeRequired');
    if (dto.mode === 'live') {
      if (!dto.credentialId) this.invalid('botCredentialRequired');
      await this.account.resolveCredentials(userId, dto.credentialId);
    }
    this.validateConfig(type, dto, spec);
    if (type === 'ai' && !(await this.aiKeys.find(userId)).configured)
      this.invalid('aiKeyMissing');
    if (type === 'signal' && dto.mode !== 'live')
      this.invalid('signalBotLiveOnly');
    if (
      dto.maxOrderAmount !== undefined &&
      !(ORDER_LIMIT_BOT_TYPES as readonly string[]).includes(type)
    )
      this.invalid('botOrderLimitUnsupported');
    if (isPerp)
      await this.validateFuturesLeverage(
        dto.symbol,
        futuresMarginOf({ config: dto.config, type }).leverage,
      );

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
        maxOrderAmount: dto.maxOrderAmount,
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

    const pionexBotId: { botId: string | null; signalType?: string } | null =
      bot.mode !== 'live'
        ? null
        : bot.type === 'grid'
          ? { botId: await this.startPionexGrid(bot) }
          : bot.type === 'futures_grid'
            ? { botId: await this.startPionexFuturesGrid(bot) }
            : bot.type === 'signal'
              ? await this.startSignalBot(bot)
              : null;

    const [updated] = await this.db
      .update(quantBot)
      .set({
        pionexBotId: pionexBotId?.botId ?? null,
        pionexSignalType: pionexBotId?.signalType ?? null,
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

  async regenerateWebhookToken(userId: string, id: string) {
    const bot = await this.owned(userId, id);
    if (bot.type !== 'webhook') this.invalid('botNotWebhook');

    const webhookToken = randomBytes(WEBHOOK_TOKEN_BYTES).toString('base64url');
    await this.db
      .update(quantBot)
      .set({ webhookTokenHash: hashToken(webhookToken) })
      .where(eq(quantBot.id, bot.id));

    return { webhookToken };
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

  async listOrders(
    userId: string,
    id: string,
    {
      limit = 10,
      offset = 0,
      sortBy,
      sortDirection = 'desc',
    }: QuantBotOrderPaginationQueryDto = {},
  ): Promise<{ data: QuantBotOrderDto[]; total: number }> {
    const bot = await this.owned(userId, id);
    const fieldMap: Record<QuantBotOrderSortField, Column | SQL> = {
      createdAt: quantBotOrder.createdAt,
      filledSize: quantBotOrder.filledSize,
      price: quantBotOrder.price,
      side: quantBotOrder.side,
      status: sql`${quantBotOrder.status}::text`,
      tag: quantBotOrder.tag,
      type: quantBotOrder.type,
    };
    const dir = sortDirection === 'desc' ? desc : asc;
    const where = eq(quantBotOrder.botId, bot.id);

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(quantBotOrder)
        .where(where)
        .orderBy(
          dir(fieldMap[sortBy ?? 'createdAt']),
          desc(quantBotOrder.createdAt),
        )
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(quantBotOrder).where(where),
    ]);

    const data = rows.map((row) => ({
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

    return { data, total };
  }

  async listFills(
    userId: string,
    id: string,
    {
      limit = 10,
      offset = 0,
      sortBy,
      sortDirection = 'desc',
    }: QuantBotFillPaginationQueryDto = {},
  ): Promise<{ data: QuantBotFillDto[]; total: number }> {
    const bot = await this.owned(userId, id);
    const fieldMap: Record<QuantBotFillSortField, Column | SQL> = {
      fee: quantBotFill.fee,
      filledAt: quantBotFill.filledAt,
      price: quantBotFill.price,
      side: quantBotFill.side,
      size: quantBotFill.size,
    };
    const dir = sortDirection === 'desc' ? desc : asc;
    const where = eq(quantBotFill.botId, bot.id);

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(quantBotFill)
        .where(where)
        .orderBy(
          dir(fieldMap[sortBy ?? 'filledAt']),
          desc(quantBotFill.filledAt),
        )
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(quantBotFill).where(where),
    ]);

    const data = rows.map(
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

    return { data, total };
  }

  async listFillMarkers(
    userId: string,
    id: string,
    since: string,
  ): Promise<QuantBotFillMarkerDto[]> {
    const bot = await this.owned(userId, id);

    return this.db
      .select({
        filledAt: quantBotFill.filledAt,
        price: quantBotFill.price,
        side: quantBotFill.side,
      })
      .from(quantBotFill)
      .where(
        and(
          eq(quantBotFill.botId, bot.id),
          gte(quantBotFill.filledAt, new Date(since)),
        ),
      )
      .orderBy(asc(quantBotFill.filledAt));
  }

  async listEvents(
    userId: string,
    id: string,
    {
      kinds,
      limit = 10,
      offset = 0,
      sortBy,
      sortDirection = 'desc',
    }: QuantBotEventPaginationQueryDto = {},
  ): Promise<{ data: QuantBotEventDto[]; total: number }> {
    const bot = await this.owned(userId, id);
    const fieldMap: Record<QuantBotEventSortField, Column | SQL> = {
      createdAt: quantBotEvent.createdAt,
      kind: quantBotEvent.kind,
    };
    const dir = sortDirection === 'desc' ? desc : asc;
    const where = and(
      eq(quantBotEvent.botId, bot.id),
      kinds?.length ? inArray(quantBotEvent.kind, kinds) : undefined,
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(quantBotEvent)
        .where(where)
        .orderBy(
          dir(fieldMap[sortBy ?? 'createdAt']),
          desc(quantBotEvent.createdAt),
        )
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(quantBotEvent).where(where),
    ]);

    const data = rows.map(({ createdAt, id: eventId, kind, payload }) => ({
      createdAt,
      id: eventId,
      kind,
      payload: optional(payload),
    }));

    return { data, total };
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

  async gridCheck(
    userId: string,
    { config, credentialId, investment, symbol }: GridCheckDto,
  ): Promise<GridCheckResultDto> {
    const spec = await botSymbolSpec(this.symbols, {
      config,
      symbol,
      type: 'grid',
    });
    const check = await this.withExchangeError(async () =>
      this.pionexGrid.checkParams(
        await this.account.resolveCredentials(userId, credentialId),
        spec,
        config,
        investment,
      ),
    );

    return {
      fee: optionalNumber(check.estimateFee),
      maxInvestment: optionalNumber(check.maxInvestment),
      minInvestment: optionalNumber(check.minInvestment),
      perVolume: optionalNumber(check.estimatePerVolume),
    };
  }

  /** 對執行中的 Pionex 現貨網格追加投入、改區間或提取利潤；Pionex 沒有這些操作的試算端點 */
  async gridOperation(
    userId: string,
    id: string,
    dto: GridOperationDto,
  ): Promise<void> {
    const bot = await this.owned(userId, id);
    if (
      bot.type !== 'grid' ||
      bot.mode !== 'live' ||
      !bot.pionexBotId ||
      !bot.credentialId
    )
      this.invalid('botNotPionexGrid');
    if (bot.status !== 'running')
      throw new ConflictException(this.t('botNotRunning'));

    const spec = await botSymbolSpec(this.symbols, bot);
    const credentials = await this.account.resolveCredentials(
      userId,
      bot.credentialId,
    );
    const buOrderId = bot.pionexBotId;
    const amount = () =>
      toDecimalString(
        dto.amount ?? this.invalid('futuresGridOperationIncomplete'),
        spec.amountPrecision,
      );

    await this.withExchangeError(async () => {
      switch (dto.operation) {
        case 'invest':
          return this.pionexGrid.investIn(credentials, buOrderId, amount());
        case 'profit':
          return this.pionexGrid.extractProfit(
            credentials,
            buOrderId,
            amount(),
          );
        case 'range': {
          const { bottom, row, top } = dto;
          if (top === undefined || bottom === undefined || row === undefined)
            this.invalid('futuresGridOperationIncomplete');
          if (top <= bottom) this.invalid('gridRangeInvalid');

          return this.pionexGrid.adjustParams(credentials, {
            bottom: toDecimalString(bottom, spec.pricePrecision),
            buOrderId,
            row,
            top: toDecimalString(top, spec.pricePrecision),
          });
        }
      }
    }, 'exchangeRejected');

    // 投入與區間以 Pionex 回報為準，交給同步寫回
    await this.syncSpotGridConfig(
      bot,
      (await this.pionexGrid.get(credentials, buOrderId)).buOrderData,
    );
    await this.db.insert(quantBotEvent).values({
      botId: bot.id,
      id: randomUUID(),
      kind: 'grid_operation',
      payload: { ...dto },
    });
  }

  async futuresGridCheck(
    userId: string,
    { config, credentialId, investment, symbol }: FuturesGridCheckDto,
  ): Promise<FuturesGridCheckResultDto> {
    const spec = await botSymbolSpec(this.symbols, {
      config,
      symbol,
      type: 'futures_grid',
    });
    const check = await this.withExchangeError(async () =>
      this.pionexFuturesGrid.checkParams(
        await this.account.resolveCredentials(userId, credentialId),
        spec,
        config,
        investment,
      ),
    );
    const toNumber = (value?: string) =>
      value === undefined || value === '' || Number(value) === 0
        ? undefined
        : Number(value);

    return {
      liquidationPriceDown: toNumber(check.estimateLiquidationPriceDown),
      liquidationPriceUp: toNumber(check.estimateLiquidationPriceUp),
      maxInvestment: toNumber(check.maxInvestment),
      minInvestment: toNumber(check.minInvestment),
      perVolume: toNumber(check.estimatePerVolume),
    };
  }

  /** 對執行中的 Pionex 合約網格做調整；dryRun 只向 Pionex 試算不執行 */
  async futuresGridOperation(
    userId: string,
    id: string,
    dto: FuturesGridOperationDto,
    dryRun: boolean,
  ): Promise<FuturesGridOperationCheckDto> {
    const bot = await this.owned(userId, id);
    if (
      bot.type !== 'futures_grid' ||
      bot.mode !== 'live' ||
      !bot.pionexBotId ||
      !bot.credentialId
    )
      this.invalid('botNotPionexFuturesGrid');
    if (bot.status !== 'running')
      throw new ConflictException(this.t('botNotRunning'));

    const spec = await botSymbolSpec(this.symbols, bot);
    const credentials = await this.account.resolveCredentials(
      userId,
      bot.credentialId,
    );
    const config = bot.config as unknown as FuturesGridConfigDto;
    const price = (value: number) =>
      toDecimalString(value, spec.pricePrecision);
    const required = <T>(value: T | undefined): T =>
      value ?? this.invalid('futuresGridOperationIncomplete');
    const buOrderId = bot.pionexBotId;

    if (dto.operation === 'stops') {
      const merged = {
        ...config,
        ...(dto.lossStop !== undefined && {
          lossStop: dto.lossStop ?? undefined,
        }),
        ...(dto.lossStopHigh !== undefined && {
          lossStopHigh: dto.lossStopHigh ?? undefined,
        }),
        ...(dto.lossStopLimitHigh !== undefined && {
          lossStopLimitHigh: dto.lossStopLimitHigh ?? undefined,
        }),
        ...(dto.profitStop !== undefined && {
          profitStop: dto.profitStop ?? undefined,
        }),
      };
      this.validateFuturesGridStops(merged);
      if (dryRun) return { ok: true };

      const stopItem = (
        type: 'stop_loss' | 'stop_profit',
        stop: FuturesGridStopDto | null | undefined,
      ) =>
        stop === undefined
          ? []
          : [
              {
                stop_type: stop?.type ?? 'price',
                type,
                value:
                  stop === null
                    ? ''
                    : toPionexStop(
                        stop,
                        type === 'stop_loss' ? 'loss' : 'profit',
                        spec,
                      ),
                ...(stop?.type === 'price_limit' &&
                  stop.limitPrice && { limit_price: price(stop.limitPrice) }),
                ...(type === 'stop_loss' &&
                  config.trend === 'no_trend' &&
                  dto.lossStopHigh !== undefined && {
                    stop_high_price:
                      dto.lossStopHigh === null ? '' : price(dto.lossStopHigh),
                  }),
                ...(type === 'stop_loss' &&
                  config.trend === 'no_trend' &&
                  stop?.type === 'price_limit' &&
                  dto.lossStopLimitHigh !== undefined && {
                    limit_high_price:
                      dto.lossStopLimitHigh === null
                        ? ''
                        : price(dto.lossStopLimitHigh),
                  }),
              },
            ];
      await this.withExchangeError(
        () =>
          this.pionexFuturesGrid.updateStops(credentials, {
            bu_order_id: buOrderId,
            list: [
              ...stopItem('stop_loss', dto.lossStop),
              ...stopItem('stop_profit', dto.profitStop),
            ],
          }),
        'exchangeRejected',
      );
      await this.updateConfig(bot, merged);
      return { ok: true };
    }

    const current = await this.priceOf(bot.symbol);
    const request = ((): { body: object; path: FuturesGridOperationPath } => {
      switch (dto.operation) {
        case 'invest':
          return {
            body: {
              buOrderId,
              extraMargin: false,
              openPrice: current,
              quoteInvestment: required(dto.amount),
              type: 'invest_in',
            },
            path: 'adjustParams',
          };
        case 'range':
          if (required(dto.top) <= required(dto.bottom))
            this.invalid('gridRangeInvalid');
          return {
            body: {
              bottom: price(dto.bottom!),
              buOrderId,
              extraMargin: false,
              keepInvestment: true,
              openPrice: current,
              row: required(dto.row),
              top: price(dto.top!),
              type: 'adjust_params',
            },
            path: 'adjustParams',
          };
        case 'reduce':
          return {
            body: {
              buOrderId,
              openPrice: price(current),
              reduceNum: required(dto.reduceNum),
            },
            path: 'reduce',
          };
        case 'pause': {
          const mode = required(dto.pauseMode);
          return {
            body: {
              buOrderId,
              mode,
              ...(mode === 'conditional' && {
                ...(dto.triggerUp && {
                  triggerPausePriceUp: price(dto.triggerUp),
                }),
                ...(dto.triggerDown && {
                  triggerPausePriceDown: price(dto.triggerDown),
                }),
              }),
              // 暫停期間仍讓停利停損生效，避免暫停時失去保護
              ...(!dryRun && {
                stopLossEnabled: true,
                stopProfitEnabled: true,
              }),
            },
            path: 'pause',
          };
        }
        case 'resume':
          return {
            body: {
              buOrderId,
              ...(dto.triggerUp && {
                triggerResumePriceUp: price(dto.triggerUp),
              }),
              ...(dto.triggerDown && {
                triggerResumePriceDown: price(dto.triggerDown),
              }),
            },
            path: 'resume',
          };
        case 'addMargin':
        case 'reduceMargin':
          return {
            body: {
              amount: required(dto.amount),
              buOrderId,
              ...(!dryRun && { coin: spec.quote }),
            },
            path: dto.operation,
          };
      }
    })();

    const check = await this.withExchangeError(
      () =>
        this.pionexFuturesGrid.operate(
          credentials,
          request.path,
          request.body,
          true,
        ),
      'exchangeRejected',
    );
    const result = toOperationCheck(check);
    if (dryRun || !result.ok) return result;

    await this.withExchangeError(
      () =>
        this.pionexFuturesGrid.operate(
          credentials,
          request.path,
          request.body,
          false,
        ),
      'exchangeRejected',
    );
    if (dto.operation === 'range')
      await this.updateConfig(bot, {
        ...config,
        bottom: dto.bottom!,
        row: dto.row!,
        top: dto.top!,
      });
    await this.db.insert(quantBotEvent).values({
      botId: bot.id,
      id: randomUUID(),
      kind: 'futures_grid_operation',
      payload: { ...dto },
    });

    return result;
  }

  private async syncSpotGridConfig(bot: QuantBot, data: PionexSpotGridData) {
    const config = bot.config as unknown as GridConfigDto;
    const next: GridConfigDto = {
      ...config,
      bottom: optionalNumber(data.bottom) ?? config.bottom,
      lossStop: fromPionexSpotStop(data.lossStopType, data.lossStop),
      profitStop: fromPionexSpotStop(data.profitStopType, data.profitStop),
      row: data.row ?? config.row,
      top: optionalNumber(data.top) ?? config.top,
    };
    const investment =
      optionalNumber(data.quoteTotalInvestment) ?? bot.investment;
    if (
      investment === bot.investment &&
      JSON.stringify(next) === JSON.stringify(config)
    )
      return;

    await this.db
      .update(quantBot)
      .set({
        config: next as unknown as Record<string, unknown>,
        investment,
      })
      .where(eq(quantBot.id, bot.id));
  }

  // 參數可能在 Pionex App 裡被調整（追加投入、改區間、改停利停損），以 Pionex 為準
  private async syncFuturesGridConfig(
    bot: QuantBot,
    data: PionexFuturesGridData,
  ) {
    const config = bot.config as unknown as FuturesGridConfigDto;
    const next: FuturesGridConfigDto = {
      ...config,
      bottom: optionalNumber(data.bottom) ?? config.bottom,
      extraMargin: optionalNumber(data.extraMargin),
      leverage: optionalNumber(data.leverage) ?? config.leverage,
      lossStop: fromPionexStop(
        data.lossStopType,
        data.lossStop,
        data.lossStopLimitPrice,
      ),
      lossStopHigh: optionalNumber(data.lossStopHigh),
      lossStopLimitHigh: optionalNumber(data.lossStopLimitHighPrice),
      profitStop: fromPionexStop(
        data.profitStopType,
        data.profitStop,
        data.profitStopLimitPrice,
      ),
      row: data.row ?? config.row,
      top: optionalNumber(data.top) ?? config.top,
    };
    const investment = optionalNumber(data.quoteInvestment) ?? bot.investment;
    if (
      investment === bot.investment &&
      JSON.stringify(next) === JSON.stringify(config)
    )
      return;

    await this.db
      .update(quantBot)
      .set({
        config: next as unknown as Record<string, unknown>,
        investment,
      })
      .where(eq(quantBot.id, bot.id));
  }

  private async updateConfig(bot: QuantBot, config: FuturesGridConfigDto) {
    await this.db
      .update(quantBot)
      .set({ config: config as unknown as Record<string, unknown> })
      .where(eq(quantBot.id, bot.id));
  }

  /**
   * Pionex 內建網格可能因停損停利、強平或資金不足自己結束，結束了就同步成停止。
   * 合約機器人自己的每日虧損上限也在這裡檢查，所以只有伺服器在跑時才會生效。
   */
  async listEquity(
    userId: string,
    id: string,
  ): Promise<QuantBotEquityPointDto[]> {
    const bot = await this.owned(userId, id);
    const [range] = await this.db
      .select({
        first: sql<Date | null>`min(${quantBotEquity.time})`,
        last: sql<Date | null>`max(${quantBotEquity.time})`,
      })
      .from(quantBotEquity)
      .where(eq(quantBotEquity.botId, bot.id));
    if (!range.first || !range.last) return [];

    const span =
      new Date(range.last).getTime() - new Date(range.first).getTime();
    const bucketMs = Math.max(
      EQUITY_SAMPLE_MS,
      Math.ceil(span / EQUITY_MAX_POINTS / EQUITY_SAMPLE_MS) * EQUITY_SAMPLE_MS,
    );
    const bucket = sql`date_bin(${sql.raw(`'${bucketMs} milliseconds'`)}::interval, ${quantBotEquity.time}, timestamp '2000-01-01')`;

    const rows = await this.db
      .selectDistinctOn([bucket], {
        equity: quantBotEquity.equity,
        pnl: quantBotEquity.pnl,
        time: quantBotEquity.time,
      })
      .from(quantBotEquity)
      .where(eq(quantBotEquity.botId, bot.id))
      .orderBy(bucket, desc(quantBotEquity.time));

    return rows;
  }

  @Interval(EQUITY_SAMPLE_MS)
  async sampleEquity() {
    if (!this.engine.hasLease) return;

    const bots = await this.db.query.quantBot.findMany({
      where: and(
        eq(quantBot.environment, quantEnvironment()),
        eq(quantBot.status, 'running'),
      ),
    });
    const time = new Date(
      Math.floor(Date.now() / EQUITY_SAMPLE_MS) * EQUITY_SAMPLE_MS,
    );

    for (const bot of bots) {
      try {
        const { equity, pnl } = await this.summary(bot);
        await this.db
          .insert(quantBotEquity)
          .values({ botId: bot.id, equity, pnl, time })
          .onConflictDoNothing();
      } catch (error) {
        this.logger.error(
          `Sample equity of ${bot.id} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  @Interval(PIONEX_GRID_SYNC_MS)
  async syncPionexGrids() {
    if (!this.engine.hasLease) return;

    const bots = await this.db.query.quantBot.findMany({
      orderBy: asc(quantBot.createdAt),
      where: and(
        eq(quantBot.environment, quantEnvironment()),
        eq(quantBot.status, 'running'),
        eq(quantBot.mode, 'live'),
        inArray(quantBot.type, ['grid', 'futures_grid', 'signal']),
      ),
    });
    const today = dayOf(Date.now());

    for (const bot of bots) {
      if (!bot.pionexBotId || !bot.credentialId) continue;

      try {
        const { finished, pnl, reason } = await this.pionexBotState(bot);
        if (finished) {
          this.dayStartPnl.delete(bot.id);
          await this.markStopped(bot, reason ?? 'pionex_finished');
          continue;
        }
        if (bot.type === 'grid') continue;

        const start = this.dayStartPnl.get(bot.id);
        if (start?.day !== today)
          this.dayStartPnl.set(bot.id, { day: today, pnl });
        const loss = this.dayStartPnl.get(bot.id)!.pnl - pnl;

        if (bot.maxDailyLoss !== null && loss >= bot.maxDailyLoss)
          await this.stopBot(bot, 'daily_loss_limit');
      } catch (error) {
        this.logger.error(
          `Sync ${bot.id} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async pionexBotState(
    bot: QuantBot,
  ): Promise<{ finished: boolean; pnl: number; reason?: string }> {
    const credentials = await this.account.resolveCredentials(
      bot.userId,
      bot.credentialId!,
    );

    switch (bot.type) {
      case 'futures_grid': {
        const { buOrderData: data } = await this.pionexFuturesGrid.get(
          credentials,
          bot.pionexBotId!,
        );
        await this.syncFuturesGridConfig(bot, data);
        return {
          finished: data.status === PIONEX_GRID_FINISHED,
          pnl: (await this.futuresGridSummary(bot, data)).pnl,
          reason: data.reasonBy,
        };
      }
      case 'signal': {
        const { buOrderData: data } = await this.pionexSignal.getSmartCopy(
          credentials,
          bot.pionexBotId!,
        );
        return {
          finished: data.status === PIONEX_GRID_FINISHED,
          pnl: Number(data.profit ?? 0),
          reason: data.reasonBy,
        };
      }
      default: {
        const { buOrderData: data } = await this.pionexGrid.get(
          credentials,
          bot.pionexBotId!,
        );
        await this.syncSpotGridConfig(bot, data);
        return {
          finished: data.status === PIONEX_GRID_FINISHED,
          pnl: 0,
          reason: data.reasonBy,
        };
      }
    }
  }

  private async markStopped(bot: QuantBot, reason: string) {
    await this.db
      .update(quantBot)
      .set({ status: 'stopped', statusReason: reason, stoppedAt: new Date() })
      .where(eq(quantBot.id, bot.id));
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

    if (executorOf(bot) === 'pionex' && bot.pionexBotId) {
      const credentials = await this.account.resolveCredentials(
        bot.userId,
        bot.credentialId!,
      );
      await this.withExchangeError(() =>
        bot.type === 'futures_grid'
          ? this.pionexFuturesGrid.cancel(credentials, bot.pionexBotId!)
          : bot.type === 'signal'
            ? this.pionexSignal.cancelSmartCopy(credentials, bot.pionexBotId!)
            : this.pionexGrid.cancel(
                credentials,
                bot.pionexBotId!,
                (bot.config as unknown as GridConfigDto).closeModel,
              ),
      );
      // 訊號只屬於這個機器人；刪掉後 TradingView 再送來的 alert 會被 Pionex 拒收
      if (bot.type === 'signal' && bot.pionexSignalType)
        await this.pionexSignal
          .deleteSignal(credentials, bot.pionexSignalType)
          .catch((error: unknown) =>
            this.logger.warn(
              `Delete signal of ${bot.id} failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
    } else if (await this.engine.stopRunner(bot.id, reason)) {
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

    await this.withExchangeError(
      () =>
        this.pionexGrid.checkParams(
          credentials,
          spec,
          bot.config as unknown as GridConfigDto,
          bot.investment,
        ),
      'exchangeRejected',
    );

    const order = await this.withExchangeError(
      () =>
        this.pionexGrid.create(
          credentials,
          spec,
          bot.config as unknown as GridConfigDto,
          bot.investment,
          bot.name,
        ),
      'exchangeRejected',
    );

    return order.buOrderId;
  }

  private async startPionexFuturesGrid(bot: QuantBot) {
    const config = bot.config as unknown as FuturesGridConfigDto;
    const spec = await botSymbolSpec(this.symbols, bot);
    const credentials = await this.account.resolveCredentials(
      bot.userId,
      bot.credentialId!,
    );
    // 交易所的風險級距可能在建立後調整，送出前再檢查一次
    await this.validateFuturesLeverage(bot.symbol, config.leverage);
    await this.withExchangeError(
      () =>
        this.pionexFuturesGrid.checkParams(
          credentials,
          spec,
          config,
          bot.investment,
        ),
      'exchangeRejected',
    );

    const order = await this.withExchangeError(
      () =>
        this.pionexFuturesGrid.create(
          credentials,
          spec,
          config,
          bot.investment,
        ),
      'exchangeRejected',
    );

    return futuresGridIdOf(order) ?? null;
  }

  private async validateFuturesLeverage(symbol: string, leverage: number) {
    const [first] = await this.symbols.riskTiersOf(symbol);
    const symbolMax = Number(first?.maxLeverage ?? 0);
    if (leverage > symbolMax)
      this.invalid('futuresLeverageAboveSymbol', { max: symbolMax });
  }

  private smartCopyParams(
    bot: QuantBot,
    spec: SymbolSpec,
    signalType: string,
  ): SmartCopyParams {
    const config = bot.config as unknown as SignalBotConfigDto;

    return {
      compound: config.compound,
      investment: toDecimalString(bot.investment, spec.amountPrecision),
      leverage: config.leverage,
      lossStopRatio:
        config.stopLoss === undefined
          ? undefined
          : String(-config.stopLoss / 100),
      profitStopRatio:
        config.takeProfit === undefined
          ? undefined
          : String(config.takeProfit / 100),
      signalType,
    };
  }

  // 每個訊號機器人各自建立一個 Pionex 自訂訊號，TradingView 的 alert 直接送到 Pionex
  private async startSignalBot(bot: QuantBot) {
    const config = bot.config as unknown as SignalBotConfigDto;
    const spec = await botSymbolSpec(this.symbols, bot);
    const credentials = await this.account.resolveCredentials(
      bot.userId,
      bot.credentialId!,
    );
    await this.validateFuturesLeverage(bot.symbol, config.leverage);

    const signal = await this.withExchangeError(
      () => this.pionexSignal.createSignal(credentials, bot.name, bot.id),
      'exchangeRejected',
    );
    try {
      const params = this.smartCopyParams(bot, spec, signal.signalType);
      const check = await this.withExchangeError(
        () => this.pionexSignal.checkSmartCopy(credentials, spec, params),
        'exchangeRejected',
      );
      if (check.maxLeverage && config.leverage > Number(check.maxLeverage))
        this.invalid('futuresLeverageAboveSymbol', {
          max: Number(check.maxLeverage),
        });

      const order = await this.withExchangeError(
        () =>
          this.pionexSignal.createSmartCopy(
            credentials,
            spec,
            params,
            bot.name,
          ),
        'exchangeRejected',
      );

      return { botId: order.bu_order_id, signalType: signal.signalType };
    } catch (error) {
      await this.pionexSignal
        .deleteSignal(credentials, signal.signalType)
        .catch(() => undefined);
      throw error;
    }
  }

  async signalSetup(userId: string, id: string): Promise<SignalSetupDto> {
    const bot = await this.owned(userId, id);
    if (bot.type !== 'signal' || !bot.pionexSignalType || !bot.credentialId)
      this.invalid('botNotSignal');

    const signal = await this.withExchangeError(async () =>
      this.pionexSignal.getSignal(
        await this.account.resolveCredentials(userId, bot.credentialId!),
        bot.pionexSignalType!,
      ),
    );
    if (!signal.tradingviewConfig) this.invalid('botNotSignal');

    return signal.tradingviewConfig;
  }

  async sendSignal(
    userId: string,
    id: string,
    { action, contracts, positionSize }: SendSignalDto,
  ) {
    const bot = await this.owned(userId, id);
    if (bot.type !== 'signal' || !bot.pionexSignalType || !bot.credentialId)
      this.invalid('botNotSignal');
    if (bot.status !== 'running')
      throw new ConflictException(this.t('botNotRunning'));

    const spec = await botSymbolSpec(this.symbols, bot);
    const price = await this.priceOf(bot.symbol);
    await this.withExchangeError(
      async () =>
        this.pionexSignal.push(
          await this.account.resolveCredentials(userId, bot.credentialId!),
          spec,
          {
            action,
            contracts: String(contracts),
            positionSize: String(positionSize),
            price: String(price),
            signalType: bot.pionexSignalType!,
          },
        ),
      'exchangeRejected',
    );
    await this.db.insert(quantBotEvent).values({
      botId: bot.id,
      id: randomUUID(),
      kind: 'manual_signal',
      payload: { action, contracts, positionSize, price },
    });
  }

  private async withExchangeError<T>(
    request: () => Promise<T>,
    key: 'exchangeError' | 'exchangeRejected' = 'exchangeError',
  ) {
    try {
      return await request();
    } catch (error) {
      if (!(error instanceof PionexApiError)) throw error;

      throw new BadRequestException(this.t(key, { message: error.message }));
    }
  }

  private validateFuturesGridStops({
    lossStop,
    lossStopHigh,
    lossStopLimitHigh,
    profitStop,
    trend,
  }: FuturesGridConfigDto) {
    if (
      trend === 'no_trend' &&
      (profitStop?.type === 'price' || profitStop?.type === 'price_limit')
    )
      this.invalid('futuresGridNeutralProfitStop');
    if (
      (lossStop?.type === 'price_limit' && !lossStop.limitPrice) ||
      (profitStop?.type === 'price_limit' && !profitStop.limitPrice) ||
      (trend === 'no_trend' &&
        lossStop?.type === 'price_limit' &&
        lossStopHigh &&
        !lossStopLimitHigh)
    )
      this.invalid('futuresGridStopLimitRequired');
  }

  private validateConfig(
    type: QuantBotType,
    dto: CreateQuantBotDto,
    spec: SymbolSpec,
  ) {
    const { investment } = dto;
    const { futures } = dto.config as { futures?: FuturesPositionConfigDto };
    const leverage = futures?.leverage ?? 1;

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
      case 'futures_grid': {
        const config = dto.config as FuturesGridConfigDto;
        if (config.top <= config.bottom) this.invalid('gridRangeInvalid');
        this.validateFuturesGridStops(config);

        const lines = gridLines(config);
        const spacing = Math.min(
          ...lines.slice(1).map((line, index) => line / lines[index] - 1),
        );
        if (dto.paperFeeRate !== undefined && spacing <= dto.paperFeeRate * 2)
          this.invalid('gridSpacingTooSmall');

        // 以區間中點估每格數量，太小的格子交易所不接受
        const middle = (config.top + config.bottom) / 2;
        const quantity = futuresGridQuantity(
          { ...config, lines },
          middle,
          investment,
          dto.paperFeeRate ?? 0,
        );
        const { buys, sells } = gridLayout(lines, middle);
        const smallest = Math.min(
          ...[...buys, ...sells].map(({ line }) => line),
        );
        if (
          quantity < spec.minTradeSize ||
          quantity * smallest < spec.minAmount
        )
          this.invalid('futuresGridInvestmentTooSmall');
        return;
      }
      case 'signal':
        return;
      case 'ai':
        if ((dto.config as AiConfigDto).maxOrderAmount > investment * leverage)
          this.invalid('orderAmountAboveInvestment');
        return;
      // 合約的下單金額是倉位名目價值，投入金額是保證金，可動用名目＝投入×槓桿
      case 'dca': {
        const max = dcaMaxInvestment(dto.config as DcaConfigDto) / leverage;
        if (max > investment)
          this.invalid('dcaInvestmentTooSmall', { required: max });
        return;
      }
      case 'indicator': {
        const config = dto.config as IndicatorConfigDto;
        if (config.orderAmount > investment * leverage)
          this.invalid('orderAmountAboveInvestment');
        for (const condition of [...config.entry, ...config.exit])
          if (!this.conditionComplete(condition))
            this.invalid('indicatorConditionIncomplete');
        return;
      }
      case 'webhook': {
        if (
          (dto.config as WebhookConfigDto).orderAmount >
          investment * leverage
        )
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
    if (bot.mode === 'live' && bot.type === 'futures_grid')
      return this.futuresGridSummary(bot);
    if (bot.type === 'signal') return this.signalSummary(bot);

    const spec = await botSymbolSpec(this.symbols, bot);
    const fills = (
      await this.db.query.quantBotFill.findMany({
        orderBy: asc(quantBotFill.filledAt),
        where: eq(quantBotFill.botId, bot.id),
      })
    ).map((fill) => toBotFill(fill, spec));
    const price = await this.priceOf(bot.symbol);

    if (!isFuturesBot(bot)) {
      const account = new SpotAccount(bot.investment, fills);
      const ledger = account.snapshot();
      const equity = account.equity(price);

      return {
        averageCost: ledger.averageCost,
        equity,
        fillCount: fills.length,
        pnl: equity - bot.investment,
        position: ledger.position,
        realizedPnl: ledger.realizedPnl,
      };
    }

    const { extraMargin, leverage } = futuresMarginOf(bot);
    const committed = bot.investment + extraMargin;
    const [perp, riskTiers, fundingRows] = await Promise.all([
      this.symbols.getPerp(bot.symbol),
      this.symbols.riskTiersOf(bot.symbol),
      this.db.query.quantBotEvent.findMany({
        columns: { payload: true },
        where: and(
          eq(quantBotEvent.botId, bot.id),
          eq(quantBotEvent.kind, FUNDING_EVENT),
        ),
      }),
    ]);
    const account = new FuturesAccount({
      fills,
      fundings: fundingRows.map(({ payload }) => ({
        amount: Number(payload?.amount),
        time: Number(payload?.time),
      })),
      investment: committed,
      leverage,
      liquidationFeeRate: Number(perp.liquidationFeeRate),
      riskTiers: toRiskTiers(riskTiers),
    });
    const ledger = account.snapshot();
    const equity = account.equity(price);

    return {
      averageCost: ledger.entryPrice,
      equity,
      fillCount: fills.length,
      fundingFee: ledger.funding,
      liquidationPrice: account.liquidationPrice() ?? undefined,
      pnl: equity - committed,
      position: ledger.position,
      realizedPnl: ledger.realizedPnl - ledger.fees,
    };
  }

  private async priceOf(symbol: string) {
    return (
      this.marketCache.lastPrice(symbol) ??
      (await this.market.findCandles(symbol, '1M', 1))[0]?.close ??
      0
    );
  }

  private async signalSummary(bot: QuantBot): Promise<QuantBotSummaryDto> {
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
      const { buOrderData: data } = await this.pionexSignal.getSmartCopy(
        await this.account.resolveCredentials(bot.userId, bot.credentialId),
        bot.pionexBotId,
      );
      const [item] = data.portfolio ?? [];
      const long = Number(item?.qtyLong ?? 0);
      const short = Math.abs(Number(item?.qtyShort ?? 0));
      const position = long - short;
      const cost =
        position > 0
          ? Math.abs(Number(item?.amountLong ?? 0)) / long
          : position < 0
            ? Math.abs(Number(item?.amountShort ?? 0)) / short
            : 0;
      const pnl = Number(data.profit ?? 0);

      return {
        averageCost: cost,
        equity: bot.investment + pnl,
        fillCount: 0,
        fundingFee: Number(item?.fundingFee ?? data.fundingFee ?? 0),
        liquidationPrice: Number(item?.maintPrice ?? 0) || undefined,
        pionexStatus: data.status,
        pnl,
        position,
        realizedPnl: Number(item?.profit ?? 0),
      };
    } catch {
      return empty;
    }
  }

  private async futuresGridSummary(
    bot: QuantBot,
    known?: PionexFuturesGridData,
  ): Promise<QuantBotSummaryDto> {
    const config = bot.config as unknown as FuturesGridConfigDto;
    const committed = bot.investment + (config.extraMargin ?? 0);
    const empty = {
      averageCost: 0,
      equity: committed,
      fillCount: 0,
      pnl: 0,
      position: 0,
      realizedPnl: 0,
    };
    if (!bot.pionexBotId || !bot.credentialId) return empty;

    try {
      const data =
        known ??
        (
          await this.pionexFuturesGrid.get(
            await this.account.resolveCredentials(bot.userId, bot.credentialId),
            bot.pionexBotId,
          )
        ).buOrderData;
      const price = await this.priceOf(bot.symbol);
      const position = Number(data.position ?? 0);
      const entry = Number(data.positionOpenPrice ?? 0);
      const invested = Number(data.usdtInvestment ?? committed);
      const equity =
        Number(data.marginBalance ?? invested) + position * (price - entry);
      const liquidation = Number(
        data.liquidationPrice ||
          (position < 0
            ? data.estimateLiquidationPriceUp
            : data.estimateLiquidationPriceDown) ||
          0,
      );

      return {
        averageCost: entry,
        equity,
        fillCount: 0,
        fundingFee: Number(data.totalFundingFee ?? 0),
        liquidationPrice: liquidation || undefined,
        pionexStatus: data.status,
        pnl: equity - invested,
        position,
        realizedPnl: Number(data.gridProfit ?? 0),
      };
    } catch {
      return empty;
    }
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
      const withdrawn = Number(data.profitWithdrawn ?? 0);
      const invested = Number(data.quoteTotalInvestment ?? bot.investment);

      return {
        averageCost: Number(data.averageCost ?? 0),
        equity,
        fillCount: 0,
        // 提取出去的利潤已不在機器人帳上，但仍是這個機器人賺的
        pnl: equity + withdrawn - invested,
        position,
        profitWithdrawn: withdrawn,
        realizedPnl: Number(data.gridProfit ?? 0),
      };
    } catch {
      return empty;
    }
  }

  private async summaryWithAiCost(bot: QuantBot) {
    const summary = await this.summary(bot);
    if (bot.type !== 'ai') return summary;

    return { ...summary, aiMonthCost: await this.aiAdvisor.monthCost(bot.id) };
  }

  private async toDto(bot: QuantBot): Promise<QuantBotDto> {
    return {
      config: bot.config as unknown as QuantBotDto['config'],
      createdAt: bot.createdAt,
      credentialId: optional(bot.credentialId),
      id: bot.id,
      investment: bot.investment,
      executor: executorOf(bot),
      maxDailyLoss: optional(bot.maxDailyLoss),
      maxOrderAmount: optional(bot.maxOrderAmount),
      mode: bot.mode,
      name: bot.name,
      paperFeeRate: optional(bot.paperFeeRate),
      pionexBotId: optional(bot.pionexBotId),
      startedAt: optional(bot.startedAt),
      status: bot.status,
      statusReason: optional(bot.statusReason),
      stoppedAt: optional(bot.stoppedAt),
      summary: await this.summaryWithAiCost(bot),
      symbol: bot.symbol,
      type: bot.type,
    };
  }
}
