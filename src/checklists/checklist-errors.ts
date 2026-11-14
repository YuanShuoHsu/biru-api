import { BadRequestException, NotFoundException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

type ChecklistErrorCode =
  'checklistItemInvalidRange' | 'checklistTemplateNotFound';

const errorBody = (code: ChecklistErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.checklists.${code}`) ??
    code,
});

export const badRequestError = (code: ChecklistErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const notFoundError = (code: ChecklistErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
