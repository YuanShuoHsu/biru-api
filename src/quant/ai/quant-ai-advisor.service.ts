import { Inject, Injectable } from '@nestjs/common';

import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, gte, inArray, type SQL, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as z from 'zod';

import {
  type QuantBot,
  quantAiRequest,
  quantBot,
  quantBotEvent,
} from '../../db/schema/quant.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import { DRIZZLE } from '../../drizzle/drizzle.module.js';

import { type AiConfigDto, isFuturesBot } from '../dto/quant-bot.dto.js';
import { MarketCacheService } from '../engine/market-cache.service.js';
import type {
  AiAdvisor,
  AiDecisionResult,
  AiSnapshot,
} from '../engine/strategies/ai.strategy.js';
import { QuantMarketService } from '../market/quant-market.service.js';
import { candleEndOf } from '../pionex/pionex.types.js';
import { quantEnvironment } from '../quant-environment.js';

import {
  AI_MODELS,
  type AiModel,
  DEFAULT_AI_EFFORT,
  DEFAULT_AI_MODEL,
} from './ai-model.js';
import { QuantAiKeyService } from './quant-ai-key.service.js';

export const AI_DECISION_EVENT = 'ai_decision';
export const AI_REFUSAL_EVENT = 'ai_refusal';

const MAX_TOKENS = 16_000;
const RECENT_DECISIONS = 8;
const ORDER_BOOK_LEVELS = 10;
const LANGUAGES = {
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  'zh-CN': 'Simplified Chinese',
  'zh-TW': 'Traditional Chinese (Taiwan)',
} as const;

// 回應可能由 fallback 模型產生，沒列到的模型以 Opus 4.8 的較高費率計算
const FALLBACK_PRICE = {
  cacheRead: 0.5e-6,
  cacheWrite: 6.25e-6,
  input: 5e-6,
  output: 25e-6,
};

export const DECISION_SCHEMA = {
  additionalProperties: false,
  properties: {
    action: {
      description:
        'open: add to the position in the bot direction; close: reduce or close the position; hold: do nothing',
      enum: ['open', 'close', 'hold'],
      type: 'string',
    },
    amount: {
      description:
        'For open: position notional to add, in the quote currency. Use 0 for close and hold.',
      type: 'number',
    },
    closeRatio: {
      description:
        'For close: fraction of the current position to close, between 0 and 1. Use 0 for open and hold.',
      type: 'number',
    },
    confidence: {
      description: 'Confidence in this decision, between 0 and 1.',
      type: 'number',
    },
    reasoning: {
      description: 'Why, in at most three short sentences.',
      type: 'string',
    },
  },
  required: ['action', 'amount', 'closeRatio', 'confidence', 'reasoning'],
  type: 'object',
} as const;

export const decisionSchema = z.object({
  action: z.enum(['open', 'close', 'hold']),
  amount: z.number().min(0),
  closeRatio: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const systemPrompt = (
  config: AiConfigDto,
  direction: 'long' | 'short',
  backtest = false,
) =>
  [
    'You are the decision engine of an automated trading bot on the Pionex exchange.',
    `The bot only trades ${direction === 'long' ? 'long: open means buy, close means sell' : 'short: open means sell short, close means buy back'}.`,
    backtest
      ? 'This is a backtest on historical data. Each request gives you the market snapshot at that past moment: recent candles on several intervals, indicators, the bot position and budget, and your own recent decisions with their outcomes. Historical order book data does not exist, so there is no order book.'
      : 'Each request gives you a market snapshot: recent candles on several intervals, indicators, the order book, the bot position and budget, and your own recent decisions with their outcomes.',
    'Choose exactly one action. Prefer hold when the edge is unclear; trading fees and slippage make marginal trades lose money.',
    `Never open more than maxOrderAmount or the remaining budget. The system enforces these limits and its own stop loss and take profit, and rejects orders below the exchange minimum.`,
    `Write reasoning in ${LANGUAGES[config.locale]}.`,
    ...(config.guideline?.trim()
      ? ['The operator set this trading guideline:', config.guideline.trim()]
      : []),
  ].join('\n');

const costOf = (model: string, usage: Anthropic.Beta.BetaUsage) => {
  const price = AI_MODELS[model as AiModel]?.price ?? FALLBACK_PRICE;

  return (
    usage.input_tokens * price.input +
    (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * price.cacheRead +
    usage.output_tokens * price.output
  );
};

const monthStart = () => {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

@Injectable()
export class QuantAiAdvisorService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly aiKeys: QuantAiKeyService,
    private readonly market: QuantMarketService,
    private readonly marketCache: MarketCacheService,
  ) {}

  forBot(bot: QuantBot): AiAdvisor {
    if ((bot.config as unknown as AiConfigDto).source === 'claude_code')
      return {
        decide: async (snapshot) => {
          await this.requestDecision(bot, snapshot);
          return { deferred: true };
        },
        monthCost: () => Promise.resolve(0),
      };

    return {
      decide: (snapshot) => this.decide(bot, snapshot),
      monthCost: () => this.monthCost(bot.id),
    };
  }

  // 一次只等一個判斷；新的一根收盤時，上一個還沒回或沒確認的就作廢，不會在過時的價格下單
  private async requestDecision(bot: QuantBot, snapshot: AiSnapshot) {
    const config = bot.config as unknown as AiConfigDto;
    const now = new Date(snapshot.time);
    const payload = await this.enrich(bot, snapshot);

    await this.db.transaction(async (tx) => {
      await tx
        .update(quantAiRequest)
        .set({ resolvedAt: now, status: 'expired' })
        .where(
          and(
            eq(quantAiRequest.botId, bot.id),
            eq(quantAiRequest.status, 'pending'),
          ),
        );
      await tx.insert(quantAiRequest).values({
        botId: bot.id,
        candleTime: now,
        environment: bot.environment,
        expiresAt: new Date(candleEndOf(config.interval, now.getTime())),
        id: randomUUID(),
        snapshot: payload as unknown as Record<string, unknown>,
        status: 'pending',
        userId: bot.userId,
      });
    });
  }

  /** 本月（UTC）已花的 AI 費用，拒答也照樣計費 */
  monthCost(botId: string) {
    return this.sumMonthCost(eq(quantBotEvent.botId, botId));
  }

  // 封存的機器人也算，費用已經付給 Anthropic
  userMonthCost(userId: string) {
    return this.sumMonthCost(
      inArray(
        quantBotEvent.botId,
        this.db
          .select({ id: quantBot.id })
          .from(quantBot)
          .where(
            and(
              eq(quantBot.userId, userId),
              eq(quantBot.environment, quantEnvironment()),
            ),
          ),
      ),
    );
  }

  private async sumMonthCost(scope: SQL) {
    const [row] = await this.db
      .select({
        total: sql<string>`coalesce(sum((${quantBotEvent.payload}->>'cost')::numeric), 0)`,
      })
      .from(quantBotEvent)
      .where(
        and(
          scope,
          inArray(quantBotEvent.kind, [AI_DECISION_EVENT, AI_REFUSAL_EVENT]),
          gte(quantBotEvent.createdAt, monthStart()),
        ),
      );

    return Number(row?.total ?? 0);
  }

  private async decide(
    bot: QuantBot,
    snapshot: AiSnapshot,
  ): Promise<AiDecisionResult> {
    return this.callModel(
      bot.userId,
      bot.config as unknown as AiConfigDto,
      await this.enrich(bot, snapshot),
    );
  }

  async callModel(
    userId: string,
    config: AiConfigDto,
    payload: object,
    backtest = false,
  ): Promise<AiDecisionResult> {
    const client = new Anthropic({
      apiKey: await this.aiKeys.resolve(userId),
    });
    const model = config.model ?? DEFAULT_AI_MODEL;

    const response = await client.beta.messages.create({
      ...(AI_MODELS[model].fallbacks && {
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default' as const,
      }),
      max_tokens: MAX_TOKENS,
      messages: [
        {
          content: JSON.stringify(payload),
          role: 'user',
        },
      ],
      model,
      output_config: {
        effort: config.effort ?? DEFAULT_AI_EFFORT,
        format: { schema: DECISION_SCHEMA, type: 'json_schema' },
      },
      system: systemPrompt(
        config,
        config.futures?.direction ?? 'long',
        backtest,
      ),
    });
    const cost = costOf(response.model, response.usage);
    const usage = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    };

    if (response.stop_reason === 'refusal')
      return {
        cost,
        decision: null,
        model: response.model,
        refusal: response.stop_details?.category ?? 'refusal',
        usage,
      };

    const text = response.content.find(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text',
    );
    const parsed = decisionSchema.safeParse(
      text ? (JSON.parse(text.text) as unknown) : null,
    );
    if (!parsed.success)
      return {
        cost,
        decision: null,
        model: response.model,
        refusal: `invalid_output:${response.stop_reason}`,
        usage,
      };

    return { cost, decision: parsed.data, model: response.model, usage };
  }

  // 機器人以外的市場資料與決策紀錄由這裡補上，策略只負責自己的部位與 K 線
  private async enrich(bot: QuantBot, snapshot: AiSnapshot) {
    const [depth, perp, recent] = await Promise.all([
      this.marketCache.topLevels(bot.symbol, ORDER_BOOK_LEVELS),
      isFuturesBot(bot)
        ? this.market.findPerpIndex(bot.symbol).then((index) => ({
            markPrice: Number(index.markPrice),
            nextFundingRate: Number(index.nextFundingRate),
            nextFundingTime: new Date(index.nextFundingTime).toISOString(),
          }))
        : Promise.resolve(undefined),
      this.db.query.quantBotEvent.findMany({
        columns: { createdAt: true, payload: true },
        limit: RECENT_DECISIONS,
        orderBy: desc(quantBotEvent.createdAt),
        where: and(
          eq(quantBotEvent.botId, bot.id),
          eq(quantBotEvent.kind, AI_DECISION_EVENT),
        ),
      }),
    ]);

    return {
      ...snapshot,
      orderBook: depth,
      perpetual: perp,
      recentDecisions: recent.reverse().map(({ createdAt, payload }) => ({
        action: payload?.action,
        amount: payload?.amount,
        closeRatio: payload?.closeRatio,
        executed: payload?.executed,
        price: payload?.price,
        reasoning: payload?.reasoning,
        skipped: payload?.skipReason,
        time: createdAt.toISOString(),
      })),
    };
  }
}
