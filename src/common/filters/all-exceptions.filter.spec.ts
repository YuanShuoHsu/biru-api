import { type ArgumentsHost, NotFoundException } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

import { DrizzleQueryError } from 'drizzle-orm';
import { I18nContext, I18nValidationException } from 'nestjs-i18n';

import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  const setup = () => {
    const reply = vi.fn();
    const adapterHost = {
      httpAdapter: { reply, getRequestUrl: () => '/api/images/x' },
    } as unknown as HttpAdapterHost;
    const host = {
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
    } as unknown as ArgumentsHost;
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      lang: 'en',
      t: (key: string, { lang }: { lang?: string }) => `${lang}:${key}`,
    } as unknown as I18nContext);
    const filter = new AllExceptionsFilter(adapterHost);

    return {
      reply,
      catch: (exception: unknown) => filter.catch(exception, host),
    };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['22021', '22P05'])(
    '資料庫拒收的文字（%s，含 NUL）回 400 與翻譯後的 badRequest',
    (code) => {
      const { reply, catch: handle } = setup();

      handle({ cause: { code } });

      expect(reply).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          code: 'badRequest',
          message: 'en:common.exceptions.badRequest',
          statusCode: 400,
          success: false,
        }),
        400,
      );
    },
  );

  it('驗證錯誤回 400 與翻譯後的 badRequest', () => {
    const { reply, catch: handle } = setup();

    handle(new I18nValidationException([]));

    expect(reply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        error: 'Bad Request',
        code: 'badRequest',
        message: 'en:common.exceptions.badRequest',
        statusCode: 400,
      }),
      400,
    );
  });

  it('HttpException 照原狀態碼回應', () => {
    const { reply, catch: handle } = setup();

    handle(new NotFoundException());

    expect(reply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ statusCode: 404 }),
      404,
    );
  });

  it('drizzle 包起來的 pg 錯誤也回 400', () => {
    const { reply, catch: handle } = setup();

    handle(
      new DrizzleQueryError(
        'select 1',
        [],
        Object.assign(new Error('invalid byte sequence'), { code: '22021' }),
      ),
    );

    expect(reply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ statusCode: 400 }),
      400,
    );
  });

  it.each([null, undefined])(
    '丟出 %j 時回 500 而不是讓 filter 自己出錯',
    (value) => {
      const { reply, catch: handle } = setup();

      handle(value);

      expect(reply).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ statusCode: 500 }),
        500,
      );
    },
  );

  it('其他資料庫錯誤仍是 500', () => {
    const { reply, catch: handle } = setup();

    handle({ cause: { code: '23505' } });

    expect(reply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ statusCode: 500 }),
      500,
    );
  });
});
