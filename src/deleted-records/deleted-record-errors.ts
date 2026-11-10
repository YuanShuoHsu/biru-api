import { ConflictException, NotFoundException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const deletedRecordErrorCodes = [
  'batchNotFound',
  'restoreConflict',
  'restoreInvalid',
  'restoreMissingReference',
] as const;

export type DeletedRecordErrorCode = (typeof deletedRecordErrorCodes)[number];

const errorBody = (code: DeletedRecordErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(
      `common.deletedRecords.${code}`,
    ) ?? code,
});

export const conflictError = (code: DeletedRecordErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });

export const notFoundError = (code: DeletedRecordErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
