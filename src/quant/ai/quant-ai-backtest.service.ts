import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { randomUUID } from 'node:crypto';

import {
  type QuantAiBacktest,
  quantAiBacktest,
  quantAiRequest,
} from '../../db/schema/quant.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import { DRIZZLE } from '../../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../../generated/i18n.generated.js';

import {
  QuantBacktestService,
  toBacktestResultDto,
} from '../bots/quant-backtest.service.js';
import type {
  AiConfigDto,
  AiDecisionDto,
  BacktestResultDto,
  CreateAiBacktestDto,
  QuantAiBacktestDto,
  ResumeAiBacktestDto,
} from '../dto/quant-bot.dto.js';
import type { QuantCandleDto } from '../dto/quant-market.dto.js';
import {
  type BacktestEvent,
  type FuturesBacktestMarket,
  runBacktest,
} from '../engine/backtest.js';
import { QuantEngineService } from '../engine/quant-engine.service.js';
import {
  type AiAdvisor,
  type AiSnapshot,
  CONTEXT_CANDLES,
  CONTEXT_INTERVALS,
} from '../engine/strategies/ai.strategy.js';
import { botSymbolSpec } from '../engine/symbol-spec.js';
import { QuantMarketService } from '../market/quant-market.service.js';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service.js';
import {
  candleEndOf,
  type PionexKlineInterval,
} from '../pionex/pionex.types.js';
import { quantEnvironment } from '../quant-environment.js';

import { QuantAiAdvisorService } from './quant-ai-advisor.service.js';
import { QuantAiKeyService } from './quant-ai-key.service.js';

const RECENT_DECISIONS = 8;
const LIST_LIMIT = 20;

type ErrorKey = keyof I18nTranslations['common']['quant'];

class NeedAiDecision extends Error {
  constructor(readonly snapshot: AiSnapshot) {
    super('AI decision required');
  }
}

const toCandles = (rows: number[][]): QuantCandleDto[] =>
  rows.map(([time, open, high, low, close, volume]) => ({
    close,
    high,
    low,
    open,
    time,
    volume,
  }));

const toRows = (candles: QuantCandleDto[]) =>
  candles.map(({ close, high, low, open, time, volume }) => [
    time,
    open,
    high,
    low,
    close,
    volume,
  ]);

@Injectable()
export class QuantAiBacktestService {
  private readonly logger = new Logger(QuantAiBacktestService.name);
  private readonly driving = new Set<string>();
  private readonly futuresMarkets = new Map<string, FuturesBacktestMarket>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly advisor: QuantAiAdvisorService,
    private readonly aiKeys: QuantAiKeyService,
    private readonly backtests: QuantBacktestService,
    private readonly engine: QuantEngineService,
    private readonly market: QuantMarketService,
    private readonly symbols: PionexSymbolsService,
  ) {}

  private t(key: ErrorKey) {
    return this.i18n.t(`common.quant.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  async create(
    userId: string,
    { candleCount, config, investment, symbol }: CreateAiBacktestDto,
  ): Promise<QuantAiBacktestDto> {
    const isPerp = (await this.symbols.marketTypeOf(symbol)) === 'PERP';
    if (isPerp !== !!config.futures)
      throw new BadRequestException(this.t('futuresPositionMismatch'));
    if (config.source === 'claude_api') await this.aiKeys.resolve(userId);
    await botSymbolSpec(this.symbols, { config, symbol, type: 'ai' });

    const candles = await this.market.findCandleHistory(
      symbol,
      config.interval,
      candleCount,
    );
    const from = candles[0]?.time ?? Date.now();
    // 涵蓋整段回測期間，再加上第一根之前判斷要用的那幾根
    const contextCandles = Object.fromEntries(
      await Promise.all(
        CONTEXT_INTERVALS.filter((value) => value !== config.interval).map(
          async (value) =>
            [
              value,
              toRows(
                await this.market.findCandleHistory(
                  symbol,
                  value,
                  Math.ceil(
                    (Date.now() - from) / (candleEndOf(value, from) - from),
                  ) + CONTEXT_CANDLES,
                ),
              ),
            ] as const,
        ),
      ),
    );
    const id = randomUUID();
    await this.db.insert(quantAiBacktest).values({
      candles: toRows(candles),
      contextCandles,
      config: config as unknown as Record<string, unknown>,
      environment: quantEnvironment(),
      id,
      investment,
      source: config.source,
      status: 'running',
      symbol,
      userId,
    });

    await this.advance(id);
    if (config.source === 'claude_api') void this.drive(id);

    return this.find(userId, id);
  }

  async list(userId: string): Promise<QuantAiBacktestDto[]> {
    const rows = await this.db.query.quantAiBacktest.findMany({
      limit: LIST_LIMIT,
      orderBy: desc(quantAiBacktest.createdAt),
      where: this.scope(userId),
    });

    return rows.map(toDto);
  }

  async find(userId: string, id: string): Promise<QuantAiBacktestDto> {
    return toDto(await this.owned(userId, id));
  }

  async cancel(userId: string, id: string): Promise<QuantAiBacktestDto> {
    const run = await this.owned(userId, id);
    if (run.status === 'running')
      await this.db.transaction(async (tx) => {
        await tx
          .update(quantAiBacktest)
          .set({ status: 'canceled' })
          .where(eq(quantAiBacktest.id, id));
        await tx
          .update(quantAiRequest)
          .set({ resolvedAt: new Date(), status: 'expired' })
          .where(
            and(
              eq(quantAiRequest.backtestId, id),
              eq(quantAiRequest.status, 'pending'),
            ),
          );
      });

    return this.find(userId, id);
  }

  async resumeStopped(
    userId: string,
    id: string,
    { monthlyCostLimit }: ResumeAiBacktestDto,
  ): Promise<QuantAiBacktestDto> {
    const run = await this.owned(userId, id);
    if (run.status !== 'canceled' && run.status !== 'failed')
      throw new BadRequestException(this.t('aiBacktestNotResumable'));

    const config = {
      ...(run.config as unknown as AiConfigDto),
      ...(monthlyCostLimit !== undefined && { monthlyCostLimit }),
    };
    if (config.source === 'claude_api') {
      await this.aiKeys.resolve(userId);
      if (
        config.monthlyCostLimit !== undefined &&
        run.cost >= config.monthlyCostLimit
      )
        throw new BadRequestException(this.t('aiBacktestCostLimitReached'));
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(quantAiBacktest)
        .set({
          config: config as unknown as Record<string, unknown>,
          error: null,
          status: 'running',
        })
        .where(eq(quantAiBacktest.id, id));
      // 同一根 K 線只能有一筆請求，停止時作廢的那筆要改回待判斷，不然推進時開不出新請求
      await tx
        .update(quantAiRequest)
        .set({ resolvedAt: null, status: 'pending' })
        .where(
          and(
            eq(quantAiRequest.backtestId, id),
            eq(quantAiRequest.status, 'expired'),
          ),
        );
    });

    await this.advance(id);
    if (config.source === 'claude_api') void this.drive(id);

    return this.find(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.db.delete(quantAiBacktest).where(eq(quantAiBacktest.id, id));
    this.futuresMarkets.delete(id);
  }

  async answer(requestId: string, decision: AiDecisionDto) {
    const [request] = await this.db
      .update(quantAiRequest)
      .set({
        answeredAt: new Date(),
        decision: decision as unknown as Record<string, unknown>,
        resolvedAt: new Date(),
        status: 'answered',
      })
      .where(
        and(
          eq(quantAiRequest.id, requestId),
          eq(quantAiRequest.status, 'pending'),
        ),
      )
      .returning({ backtestId: quantAiRequest.backtestId });
    if (request?.backtestId) await this.advance(request.backtestId);
  }

  // 伺服器重啟後接續 claude_api 回測；只由持有引擎租約的那台負責，避免重複呼叫計費
  @Interval(60_000)
  async resume() {
    if (!this.engine.hasLease) return;

    const rows = await this.db.query.quantAiBacktest.findMany({
      columns: { id: true },
      where: and(
        eq(quantAiBacktest.environment, quantEnvironment()),
        eq(quantAiBacktest.status, 'running'),
        eq(quantAiBacktest.source, 'claude_api'),
      ),
    });
    for (const { id } of rows) void this.drive(id);
  }

  private async drive(id: string) {
    if (this.driving.has(id)) return;
    this.driving.add(id);

    try {
      for (;;) {
        const run = await this.db.query.quantAiBacktest.findFirst({
          where: eq(quantAiBacktest.id, id),
        });
        if (run?.status !== 'running') return;

        const request = await this.db.query.quantAiRequest.findFirst({
          where: and(
            eq(quantAiRequest.backtestId, id),
            eq(quantAiRequest.status, 'pending'),
          ),
        });
        if (!request) return;

        const config = run.config as unknown as AiConfigDto;
        if (
          config.monthlyCostLimit !== undefined &&
          run.cost >= config.monthlyCostLimit
        )
          return await this.fail(id, 'ai_cost_limit');

        const result = await this.advisor.callModel(
          run.userId,
          config,
          request.snapshot,
          true,
        );
        await this.db
          .update(quantAiBacktest)
          .set({ cost: sql`${quantAiBacktest.cost} + ${result.cost}` })
          .where(eq(quantAiBacktest.id, id));
        await this.answer(
          request.id,
          result.decision ?? {
            action: 'hold',
            amount: 0,
            closeRatio: 0,
            confidence: 0,
            reasoning: `refusal:${result.refusal ?? 'unknown'}`,
          },
        );
      }
    } catch (error) {
      await this.fail(
        id,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.driving.delete(id);
    }
  }

  // 每次都從第一根重播，已記下的判斷照原樣套用，第一根缺判斷的地方開一筆請求
  private async advance(id: string) {
    const run = await this.db.query.quantAiBacktest.findFirst({
      where: eq(quantAiBacktest.id, id),
    });
    if (run?.status !== 'running') return;

    const answered = await this.db.query.quantAiRequest.findMany({
      columns: { candleTime: true, decision: true },
      orderBy: asc(quantAiRequest.candleTime),
      where: and(
        eq(quantAiRequest.backtestId, id),
        eq(quantAiRequest.status, 'answered'),
      ),
    });
    const decisions = new Map(
      answered.map(({ candleTime, decision }) => [
        candleTime.getTime(),
        decision as unknown as AiDecisionDto,
      ]),
    );
    const config = run.config as unknown as AiConfigDto;
    const candles = toCandles(run.candles);
    const decisionEvents: BacktestEvent[] = [];
    const replay = async (until: QuantCandleDto[]) =>
      runBacktest({
        aiAdvisor: advisor,
        candles: until,
        config,
        contextCandles: Object.fromEntries(
          Object.entries(run.contextCandles ?? {}).map(([value, rows]) => [
            value as PionexKlineInterval,
            toCandles(rows),
          ]),
        ),
        futures: config.futures
          ? await this.futuresMarketOf(run, candles)
          : undefined,
        interval: config.interval,
        investment: run.investment,
        onEvent: (event) => {
          if (event.kind === 'ai_decision') decisionEvents.push(event);
        },
        spec: await botSymbolSpec(this.symbols, {
          config,
          symbol: run.symbol,
          type: 'ai',
        }),
        type: 'ai',
      });
    const advisor: AiAdvisor = {
      decide: (snapshot) => {
        const decision = decisions.get(Date.parse(snapshot.time));
        if (!decision) throw new NeedAiDecision(snapshot);

        return Promise.resolve({
          cost: 0,
          decision,
          model: 'recorded',
          usage: { input: 0, output: 0 },
        });
      },
      inline: true,
      monthCost: () => Promise.resolve(0),
    };

    try {
      const result = await replay(candles);

      await this.db
        .update(quantAiBacktest)
        .set({
          decidedCount: decisions.size,
          result: toBacktestResultDto(result, candles) as unknown as Record<
            string,
            unknown
          >,
          status: 'completed',
        })
        .where(eq(quantAiBacktest.id, id));
      this.futuresMarkets.delete(id);
    } catch (error) {
      if (!(error instanceof NeedAiDecision)) {
        this.logger.error(error instanceof Error ? error.stack : error);
        return this.fail(
          id,
          error instanceof Error ? error.message : String(error),
        );
      }

      const time = Date.parse(error.snapshot.time);
      // 和實盤的 recentDecisions 同樣欄位，讓模型看得到每次判斷有沒有成交、在什麼價格
      const recentDecisions = decisionEvents
        .slice(-RECENT_DECISIONS)
        .map(({ payload, time: decidedAt }) => ({
          action: payload?.action,
          amount: payload?.amount,
          closeRatio: payload?.closeRatio,
          executed: payload?.executed,
          price: payload?.price,
          reasoning: payload?.reasoning,
          skipped: payload?.skipReason,
          time: new Date(decidedAt).toISOString(),
        }));

      await this.db
        .insert(quantAiRequest)
        .values({
          backtestId: id,
          candleTime: new Date(time),
          environment: run.environment,
          id: randomUUID(),
          snapshot: { ...error.snapshot, backtest: true, recentDecisions },
          status: 'pending',
          userId: run.userId,
        })
        .onConflictDoNothing();

      // 判斷時間是該根的收盤時間
      const decided = candles.filter(
        ({ time: candleTime }) =>
          candleEndOf(config.interval, candleTime) < time,
      );
      const partial = decided.length
        ? toBacktestResultDto(await replay(decided), decided)
        : null;
      await this.db
        .update(quantAiBacktest)
        .set({
          decidedCount: decisions.size,
          result: partial as unknown as Record<string, unknown> | null,
        })
        .where(eq(quantAiBacktest.id, id));
    }
  }

  private async futuresMarketOf(
    run: QuantAiBacktest,
    candles: QuantCandleDto[],
  ) {
    const cached = this.futuresMarkets.get(run.id);
    if (cached) return cached;

    const market = await this.backtests.futuresMarket(
      run.symbol,
      candles[0]?.time ?? 0,
    );
    this.futuresMarkets.set(run.id, market);

    return market;
  }

  private async fail(id: string, error: string) {
    await this.db
      .update(quantAiBacktest)
      .set({ error, status: 'failed' })
      .where(
        and(eq(quantAiBacktest.id, id), eq(quantAiBacktest.status, 'running')),
      );
    this.futuresMarkets.delete(id);
  }

  private scope(userId: string) {
    return and(
      eq(quantAiBacktest.userId, userId),
      eq(quantAiBacktest.environment, quantEnvironment()),
    );
  }

  private async owned(userId: string, id: string) {
    const run = await this.db.query.quantAiBacktest.findFirst({
      where: and(eq(quantAiBacktest.id, id), this.scope(userId)),
    });
    if (!run) throw new NotFoundException(this.t('aiBacktestNotFound'));

    return run;
  }
}

const toDto = (run: QuantAiBacktest): QuantAiBacktestDto => ({
  candleCount: run.candles.length,
  config: run.config as unknown as AiConfigDto,
  cost: run.cost,
  createdAt: run.createdAt,
  decidedCount: run.decidedCount,
  error: run.error ?? undefined,
  from: run.candles[0]?.[0] ?? 0,
  id: run.id,
  investment: run.investment,
  result: (run.result as unknown as BacktestResultDto | null) ?? undefined,
  source: run.source,
  status: run.status,
  symbol: run.symbol,
  to: run.candles.at(-1)?.[0] ?? 0,
});
