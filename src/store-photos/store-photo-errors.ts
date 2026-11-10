import { NotFoundException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const storePhotoErrorCodes = ['storePhotoNotFound'] as const;

export type StorePhotoErrorCode = (typeof storePhotoErrorCodes)[number];

export const notFoundError = (code: StorePhotoErrorCode) =>
  new NotFoundException({
    error: 'Not Found',
    code,
    message:
      I18nContext.current<I18nTranslations>()?.t(
        `common.storePhotos.${code}`,
      ) ?? code,
  });
