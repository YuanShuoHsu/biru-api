// https://nestjs-i18n.com/guides/resolvers

import { type ExecutionContext, Injectable } from '@nestjs/common';

import type { I18nResolver } from 'nestjs-i18n';

import type { Language } from '../../db/schema/enums.js';
import { pickLanguage } from '../utils/language.js';

type LanguageSource = {
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
};

const sourceOf = (context: ExecutionContext): LanguageSource | undefined => {
  switch (context.getType()) {
    case 'http':
      return context.switchToHttp().getRequest<LanguageSource>();
    case 'ws':
      return context.switchToWs().getClient<{ handshake?: LanguageSource }>()
        .handshake;
    default:
      return undefined;
  }
};

const firstString = (value: unknown) => {
  const first: unknown = Array.isArray(value) ? value[0] : value;

  return typeof first === 'string' ? first : undefined;
};

// 取代 nestjs-i18n 的 QueryResolver／HeaderResolver／AcceptLanguageResolver：三個來源都經過 pickLanguage，
// 讓 API 回應和信件、Better Auth 錯誤訊息用同一套比對（zh-HK → zh-TW、依 q 值排序）
@Injectable()
export class LanguageResolver implements I18nResolver {
  resolve(context: ExecutionContext): Language | undefined {
    const source = sourceOf(context);

    return [
      firstString(source?.query?.lang),
      firstString(source?.headers?.['x-lang']),
      firstString(source?.headers?.['accept-language']),
    ]
      .map((value) => pickLanguage(value))
      .find((language) => language !== undefined);
  }
}
