import { BadRequestException, ConflictException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const waitlistErrorCodes = [
  'waitlistClosed',
  'waitlistCutoff',
  'waitlistDisabled',
  'waitlistGroupsInvalid',
  'waitlistPartySizeUnavailable',
  'waitlistPaused',
  'waitlistPhoneInQueue',
  'waitlistTransitionInvalid',
] as const;

export type WaitlistErrorCode = (typeof waitlistErrorCodes)[number];

export type WaitlistAudience = 'guest' | 'staff';

const errorBody = (code: WaitlistErrorCode, audience: WaitlistAudience) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(
      `common.waitlist.${audience}.${code}`,
    ) ?? code,
});

export const badRequestError = (
  code: WaitlistErrorCode,
  audience: WaitlistAudience,
) =>
  new BadRequestException({
    error: 'Bad Request',
    ...errorBody(code, audience),
  });

export const conflictError = (
  code: WaitlistErrorCode,
  audience: WaitlistAudience,
) => new ConflictException({ error: 'Conflict', ...errorBody(code, audience) });
