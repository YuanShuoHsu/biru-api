import { ForbiddenException } from '@nestjs/common';
import {
  EXCEPTION_FILTERS_METADATA,
  PIPES_METADATA,
} from '@nestjs/common/constants';
import type { AuthService } from '@thallesp/nestjs-better-auth';

import type { I18nContext } from 'nestjs-i18n';

import { AllWsExceptionsFilter } from '../common/filters/all-ws-exceptions.filter.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { QuantGateway } from './quant.gateway.js';

describe('QuantGateway', () => {
  it('整個 gateway 掛上 AllWsExceptionsFilter', () => {
    expect(
      Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, QuantGateway),
    ).toEqual([AllWsExceptionsFilter]);
  });

  it('不另掛 ValidationPipe，以免連 @I18n() 參數一起驗證而擋下 watchAccount、watchBots', () => {
    expect(Reflect.getMetadata(PIPES_METADATA, QuantGateway)).toBeUndefined();
  });

  it('watchBots 沒有 session 時回 403，帶代碼與翻譯後的訊息', async () => {
    const authService = {
      api: { getSession: vi.fn().mockResolvedValue(null) },
    } as unknown as AuthService;
    const gateway = new QuantGateway(
      {} as never,
      authService,
      {} as never,
      {} as never,
      {} as never,
    );
    const i18n = {
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext<I18nTranslations>;

    const error = await gateway
      .watchBots({ handshake: { headers: {} } } as never, i18n)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      error: 'Forbidden',
      code: 'forbidden',
      message: 'translated:common.exceptions.forbidden',
    });
  });
});
