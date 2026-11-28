import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const menuErrorCodes = [
  'addOnMenuSectionNotFound',
  'addOnNotFound',
  'addOnSelf',
  'addOnTargetAttached',
  'addOnTargetRequired',
  'eligibleQuantityExceedsDailyLimit',
  'fixedSweetnessLevelRequired',
  'menuItemModifierGroupNotFound',
  'menuItemNotFound',
  'menuNotFound',
  'menuPdfTooLong',
  'menuPdfUnsupportedCharacter',
  'menuSectionNotFound',
  'modifierGroupAttached',
  'modifierGroupNotFound',
  'modifierNotFound',
  'offerNotFound',
  'parentSectionDescendant',
  'parentSectionNotFound',
  'parentSectionSelf',
  'printerNotFound',
  'promoDateRangeInvalid',
  'selectionCountInvalid',
] as const;

export type MenuErrorCode = (typeof menuErrorCodes)[number];

const errorBody = (code: MenuErrorCode, args?: Record<string, unknown>) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.menus.${code}`, {
      args,
    }) ?? code,
});

export const badRequestError = (
  code: MenuErrorCode,
  args?: Record<string, unknown>,
) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code, args) });

export const conflictError = (code: MenuErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });

export const notFoundError = (code: MenuErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
