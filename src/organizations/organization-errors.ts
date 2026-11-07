import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const organizationErrorCodes = [
  'notJoinedAsPlatformAdmin',
  'showcaseOpenSelfOnly',
  'specialHoursEnded',
  'specialHoursInvalidRange',
  'specialHoursNotFound',
  'specialHoursOverlap',
  'specialHoursTooLong',
] as const;

export type OrganizationErrorCode = (typeof organizationErrorCodes)[number];

const errorBody = (
  code: OrganizationErrorCode,
  args?: Record<string, unknown>,
) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.organizations.${code}`, {
      args,
    }) ?? code,
});

export const badRequestError = (
  code: OrganizationErrorCode,
  args?: Record<string, unknown>,
) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code, args) });

export const conflictError = (
  code: OrganizationErrorCode,
  args?: Record<string, unknown>,
  extra?: Record<string, unknown>,
) =>
  new ConflictException({
    ...extra,
    error: 'Conflict',
    ...errorBody(code, args),
  });

export const forbiddenError = (code: OrganizationErrorCode) =>
  new ForbiddenException({ error: 'Forbidden', ...errorBody(code) });

export const notFoundError = (code: OrganizationErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
