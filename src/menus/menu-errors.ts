import { BadRequestException, NotFoundException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const menuErrorCodes = [
  'addOnMenuSectionNotFound',
  'fixedSweetnessLevelRequired',
  'menuItemNotFound',
  'menuSectionNotFound',
  'modifierGroupNotFound',
  'modifierNotFound',
  'offerNotFound',
  'parentSectionNotFound',
  'printerNotFound',
] as const;

export type MenuErrorCode = (typeof menuErrorCodes)[number];

const errorBody = (code: MenuErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.menus.${code}`) ?? code,
});

export const badRequestError = (code: MenuErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const notFoundError = (code: MenuErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
