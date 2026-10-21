import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import Anthropic from '@anthropic-ai/sdk';
import { and, eq } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { randomUUID } from 'node:crypto';

import {
  decryptField,
  encryptField,
} from '../../common/utils/field-encryption.js';
import { quantAiKey } from '../../db/schema/quant.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import { DRIZZLE } from '../../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../../generated/i18n.generated.js';

import type { QuantAiKeyDto } from '../dto/quant-bot.dto.js';
import { quantEnvironment } from '../quant-environment.js';

import { DEFAULT_AI_MODEL } from './ai-model.js';

@Injectable()
export class QuantAiKeyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  private t(
    key: 'aiKeyInvalid' | 'aiKeyMissing',
    args?: Record<string, unknown>,
  ) {
    return this.i18n.t(`common.quant.${key}`, {
      args,
      lang: I18nContext.current()?.lang,
    });
  }

  private scope(userId: string) {
    return and(
      eq(quantAiKey.userId, userId),
      eq(quantAiKey.environment, quantEnvironment()),
    );
  }

  async find(userId: string): Promise<Omit<QuantAiKeyDto, 'monthCost'>> {
    const row = await this.db.query.quantAiKey.findFirst({
      columns: { apiKeyLast4: true, createdAt: true },
      where: this.scope(userId),
    });

    return row ? { ...row, configured: true } : { configured: false };
  }

  // 綁定前先用這把 key 查一次模型，確認有效且帳戶能用這個模型
  async set(
    userId: string,
    apiKey: string,
  ): Promise<Omit<QuantAiKeyDto, 'monthCost'>> {
    try {
      await new Anthropic({ apiKey }).models.retrieve(DEFAULT_AI_MODEL);
    } catch (error) {
      if (!(error instanceof Anthropic.APIError)) throw error;

      throw new BadRequestException(
        this.t('aiKeyInvalid', { message: error.message }),
      );
    }

    const values = {
      apiKeyLast4: apiKey.slice(-4),
      encryptedApiKey: encryptField(apiKey, 'quantAiKey'),
    };
    const [row] = await this.db
      .insert(quantAiKey)
      .values({
        ...values,
        environment: quantEnvironment(),
        id: randomUUID(),
        userId,
      })
      .onConflictDoUpdate({
        set: values,
        target: [quantAiKey.userId, quantAiKey.environment],
      })
      .returning({
        apiKeyLast4: quantAiKey.apiKeyLast4,
        createdAt: quantAiKey.createdAt,
      });

    return { ...row, configured: true };
  }

  async remove(userId: string): Promise<void> {
    await this.db.delete(quantAiKey).where(this.scope(userId));
  }

  async resolve(userId: string): Promise<string> {
    const row = await this.db.query.quantAiKey.findFirst({
      columns: { encryptedApiKey: true },
      where: this.scope(userId),
    });
    if (!row) throw new NotFoundException(this.t('aiKeyMissing'));

    return decryptField(row.encryptedApiKey, 'quantAiKey');
  }
}
