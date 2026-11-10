import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';

export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

export const idempotencyKeyOf = (request: Request): string | null => {
  const key = request.headers['idempotency-key'];
  if (!key) return null;
  if (typeof key !== 'string' || key.length > IDEMPOTENCY_KEY_MAX_LENGTH)
    throw new BadRequestException({
      error: 'Bad Request',
      code: 'badRequest',
      message:
        I18nContext.current<I18nTranslations>()?.t(
          'common.exceptions.badRequest',
        ) ?? 'badRequest',
    });
  return key;
};

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null =>
    idempotencyKeyOf(context.switchToHttp().getRequest<Request>()),
);
