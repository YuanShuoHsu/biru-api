import {
  type ArgumentsHost,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

import { captureException } from '@sentry/nestjs';
import { DrizzleQueryError } from 'drizzle-orm';
import { I18nContext, I18nValidationException } from 'nestjs-i18n';

import { AllExceptionsFilter } from './all-exceptions.filter.js';

vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));

describe('AllExceptionsFilter', () => {
  const setup = (request: { user?: { id: string } | null } = {}) => {
    const reply = vi.fn();
    const adapterHost = {
      httpAdapter: { reply, getRequestUrl: () => '/api/images/x' },
    } as unknown as HttpAdapterHost;
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
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
    vi.mocked(captureException).mockClear();
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

  it.each([
    ['HttpException 4xx', new NotFoundException()],
    ['驗證錯誤', new I18nValidationException([])],
    ['資料庫拒收的文字', { cause: { code: '22021' } }],
  ])('%s 不送 Sentry', (_, exception) => {
    const { catch: handle } = setup();

    handle(exception);

    expect(captureException).not.toHaveBeenCalled();
  });

  it('非 HttpException 的錯誤送 Sentry，只帶使用者 id', () => {
    const { catch: handle } = setup({ user: { id: 'user-1' } });
    const error = new Error('boom');

    handle(error);

    expect(captureException).toHaveBeenCalledWith(error, {
      user: { id: 'user-1' },
    });
  });

  it('5xx 的 HttpException 送 Sentry，未登入不帶使用者', () => {
    const { catch: handle } = setup({ user: null });
    const exception = new ServiceUnavailableException();

    handle(exception);

    expect(captureException).toHaveBeenCalledWith(exception, undefined);
  });
});
