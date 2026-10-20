import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { and, desc, eq, inArray, lte, or } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  type QuantAiRequest,
  quantAiAgentToken,
  quantAiBacktest,
  quantAiRequest,
  quantBot,
} from 'src/db/schema/quant';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import type { I18nTranslations } from 'src/generated/i18n.generated';

import type {
  AiConfigDto,
  AiDecisionDto,
  QuantAgentRequestDto,
  QuantAgentTokenCreatedDto,
  QuantAgentTokenDto,
  QuantAiRequestDto,
} from '../dto/quant-bot.dto';
import { QuantEngineService } from '../engine/quant-engine.service';
import { quantEnvironment } from '../quant-environment';

import { QuantAiBacktestService } from './quant-ai-backtest.service';
import { DECISION_SCHEMA, systemPrompt } from './quant-ai-advisor.service';

const BOT_REQUEST_LIMIT = 20;

type ErrorKey = keyof I18nTranslations['common']['quant'];

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const toRequestDto = (request: QuantAiRequest): QuantAiRequestDto => ({
  answeredAt: request.answeredAt ?? undefined,
  candleTime: request.candleTime,
  createdAt: request.createdAt,
  decision: (request.decision as unknown as AiDecisionDto | null) ?? undefined,
  expiresAt: request.expiresAt ?? undefined,
  id: request.id,
  price: Number(request.snapshot.lastPrice ?? 0),
  status: request.status,
});

@Injectable()
export class QuantAiAgentService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly backtests: QuantAiBacktestService,
    private readonly engine: QuantEngineService,
  ) {}

  private t(key: ErrorKey) {
    return this.i18n.t(`common.quant.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  private tokenScope(userId: string) {
    return and(
      eq(quantAiAgentToken.userId, userId),
      eq(quantAiAgentToken.environment, quantEnvironment()),
    );
  }

  async findToken(userId: string): Promise<QuantAgentTokenDto> {
    const row = await this.db.query.quantAiAgentToken.findFirst({
      columns: { createdAt: true, lastUsedAt: true, tokenLast4: true },
      where: this.tokenScope(userId),
    });

    return row
      ? {
          configured: true,
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt ?? undefined,
          tokenLast4: row.tokenLast4,
        }
      : { configured: false };
  }

  async regenerateToken(userId: string): Promise<QuantAgentTokenCreatedDto> {
    const token = `qa_${randomBytes(24).toString('base64url')}`;
    const values = {
      lastUsedAt: null,
      tokenHash: hashToken(token),
      tokenLast4: token.slice(-4),
    };
    await this.db
      .insert(quantAiAgentToken)
      .values({
        ...values,
        environment: quantEnvironment(),
        id: randomUUID(),
        userId,
      })
      .onConflictDoUpdate({
        set: values,
        target: [quantAiAgentToken.userId, quantAiAgentToken.environment],
      });

    return { ...(await this.findToken(userId)), token };
  }

  async removeToken(userId: string): Promise<void> {
    await this.db.delete(quantAiAgentToken).where(this.tokenScope(userId));
  }

  async authenticate(token: string): Promise<string> {
    const [row] = await this.db
      .update(quantAiAgentToken)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(quantAiAgentToken.tokenHash, hashToken(token)),
          eq(quantAiAgentToken.environment, quantEnvironment()),
        ),
      )
      .returning({ userId: quantAiAgentToken.userId });
    if (!row) throw new UnauthorizedException(this.t('agentTokenInvalid'));

    return row.userId;
  }

  /** 代理要回答的請求：執行中的 claude_code 機器人與 claude_code 回測 */
  async pending(userId: string): Promise<QuantAgentRequestDto[]> {
    await this.expireStale(userId);

    const rows = await this.db
      .select({
        backtestConfig: quantAiBacktest.config,
        botConfig: quantBot.config,
        request: quantAiRequest,
      })
      .from(quantAiRequest)
      .leftJoin(quantBot, eq(quantBot.id, quantAiRequest.botId))
      .leftJoin(
        quantAiBacktest,
        eq(quantAiBacktest.id, quantAiRequest.backtestId),
      )
      .where(
        and(
          eq(quantAiRequest.userId, userId),
          eq(quantAiRequest.environment, quantEnvironment()),
          eq(quantAiRequest.status, 'pending'),
          or(
            eq(quantBot.status, 'running'),
            and(
              eq(quantAiBacktest.status, 'running'),
              eq(quantAiBacktest.source, 'claude_code'),
            ),
          ),
        ),
      )
      .orderBy(quantAiRequest.createdAt);

    return rows.map(({ backtestConfig, botConfig, request }) => {
      const config = (botConfig ?? backtestConfig) as unknown as AiConfigDto;

      return {
        expiresAt: request.expiresAt ?? undefined,
        id: request.id,
        instructions: systemPrompt(config, config.futures?.direction ?? 'long'),
        kind: request.botId ? 'bot' : 'backtest',
        schema: DECISION_SCHEMA as unknown as Record<string, unknown>,
        snapshot: request.snapshot,
      };
    });
  }

  async submit(userId: string, id: string, decision: AiDecisionDto) {
    await this.expireStale(userId);

    const request = await this.ownedRequest(userId, id);
    if (request.status !== 'pending')
      throw new BadRequestException(this.t('aiRequestClosed'));
    if (request.backtestId) return this.backtests.answer(id, decision);

    const bot = await this.db.query.quantBot.findFirst({
      where: eq(quantBot.id, request.botId!),
    });
    if (bot?.status !== 'running')
      throw new BadRequestException(this.t('botNotRunning'));

    // 實盤只記下建議，要使用者在後台確認才下單；觀望不會下單，直接記錄
    if (bot.mode === 'live' && decision.action !== 'hold') {
      await this.db
        .update(quantAiRequest)
        .set({
          answeredAt: new Date(),
          decision: decision as unknown as Record<string, unknown>,
          status: 'awaiting_approval',
        })
        .where(eq(quantAiRequest.id, id));
      return;
    }

    await this.execute(request, 'pending', decision, {});
  }

  async listForBot(
    userId: string,
    botId: string,
  ): Promise<QuantAiRequestDto[]> {
    await this.expireStale(userId);

    const rows = await this.db.query.quantAiRequest.findMany({
      limit: BOT_REQUEST_LIMIT,
      orderBy: desc(quantAiRequest.createdAt),
      where: and(
        eq(quantAiRequest.botId, botId),
        eq(quantAiRequest.userId, userId),
        eq(quantAiRequest.environment, quantEnvironment()),
      ),
    });

    return rows.map(toRequestDto);
  }

  async approve(userId: string, botId: string, id: string) {
    await this.expireStale(userId);

    const request = await this.ownedRequest(userId, id, botId);
    if (request.status !== 'awaiting_approval' || !request.decision)
      throw new BadRequestException(this.t('aiRequestClosed'));

    await this.execute(
      request,
      'awaiting_approval',
      request.decision as unknown as AiDecisionDto,
      { approved: true },
    );
  }

  async reject(userId: string, botId: string, id: string) {
    const request = await this.ownedRequest(userId, id, botId);
    if (request.status !== 'awaiting_approval')
      throw new BadRequestException(this.t('aiRequestClosed'));

    await this.db
      .update(quantAiRequest)
      .set({ resolvedAt: new Date(), status: 'rejected' })
      .where(eq(quantAiRequest.id, id));
  }

  // 先把請求改成已執行再下單，連按兩次確認也只會執行一次；下單失敗就還原
  private async execute(
    request: QuantAiRequest,
    from: 'awaiting_approval' | 'pending',
    decision: AiDecisionDto,
    meta: Record<string, unknown>,
  ) {
    const bot = await this.db.query.quantBot.findFirst({
      columns: { status: true },
      where: eq(quantBot.id, request.botId!),
    });
    if (bot?.status !== 'running')
      throw new BadRequestException(this.t('botNotRunning'));

    const [claimed] = await this.db
      .update(quantAiRequest)
      .set({
        answeredAt: request.answeredAt ?? new Date(),
        decision: decision as unknown as Record<string, unknown>,
        resolvedAt: new Date(),
        status: 'executed',
      })
      .where(
        and(eq(quantAiRequest.id, request.id), eq(quantAiRequest.status, from)),
      )
      .returning({ id: quantAiRequest.id });
    if (!claimed) throw new BadRequestException(this.t('aiRequestClosed'));

    try {
      await this.engine.aiDecision(request.botId!, decision, {
        ...meta,
        requestId: request.id,
        source: 'claude_code',
      });
    } catch (error) {
      await this.db
        .update(quantAiRequest)
        .set({ resolvedAt: null, status: from })
        .where(eq(quantAiRequest.id, request.id));
      throw error;
    }
  }

  // 過了下一根收盤就不再執行，避免用過時的判斷在新的價格下單
  private async expireStale(userId: string) {
    const now = new Date();
    await this.db
      .update(quantAiRequest)
      .set({ resolvedAt: now, status: 'expired' })
      .where(
        and(
          eq(quantAiRequest.userId, userId),
          inArray(quantAiRequest.status, ['pending', 'awaiting_approval']),
          lte(quantAiRequest.expiresAt, now),
        ),
      );
  }

  private async ownedRequest(userId: string, id: string, botId?: string) {
    const request = await this.db.query.quantAiRequest.findFirst({
      where: and(
        eq(quantAiRequest.id, id),
        eq(quantAiRequest.userId, userId),
        eq(quantAiRequest.environment, quantEnvironment()),
        ...(botId ? [eq(quantAiRequest.botId, botId)] : []),
      ),
    });
    if (!request) throw new NotFoundException(this.t('aiRequestNotFound'));

    return request;
  }
}
