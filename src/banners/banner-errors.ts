import { BadRequestException, NotFoundException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const bannerErrorCodes = ['bannerNotFound', 'scheduleInvalid'] as const;

export type BannerErrorCode = (typeof bannerErrorCodes)[number];

const errorBody = (code: BannerErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.banners.${code}`) ??
    code,
});

export const badRequestError = (code: BannerErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const notFoundError = (code: BannerErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
