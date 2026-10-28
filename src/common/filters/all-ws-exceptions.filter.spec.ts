import {
  ArgumentsHost,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { WsException } from '@nestjs/websockets';

import { I18nService, I18nValidationException } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';
import { AllWsExceptionsFilter } from './all-ws-exceptions.filter.js';

describe('AllWsExceptionsFilter', () => {
  const setup = ({
    data = { organizationId: 'org' } as unknown,
    headers = { 'accept-language': 'en' } as Record<string, string>,
    i18nContext = undefined as { lang: string } | undefined,
  } = {}) => {
    const emit = vi.fn();
    const client = { emit, handshake: { headers, query: {} }, i18nContext };
    const host = {
      getType: () => 'ws',
      switchToWs: () => ({
        getClient: () => client,
        getData: () => data,
        getPattern: () => 'joinWaitlist',
      }),
    } as unknown as ArgumentsHost;
    const i18n = {
      t: (key: string, { lang }: { lang?: string }) => `${lang}:${key}`,
    } as unknown as I18nService<I18nTranslations>;
    const filter = new AllWsExceptionsFilter(i18n);
    const logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    return {
      emit,
      logError,
      catch: (exception: unknown) => filter.catch(exception, host),
    };
  };

  const cause = { pattern: 'joinWaitlist', data: { organizationId: 'org' } };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('WsException 以官方結構送出，不記錄錯誤', () => {
    const { emit, logError, catch: handle } = setup();

    handle(new WsException('bad'));

    expect(emit).toHaveBeenCalledWith('exception', {
      message: 'bad',
      status: 'error',
      cause,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('HttpException 帶上 response 的訊息與欄位及 statusCode', () => {
    const { emit, logError, catch: handle } = setup();

    handle(new ForbiddenException('不可加入'));
    handle(new ConflictException({ message: '衝突', code: 'conflictCode' }));

    expect(emit).toHaveBeenNthCalledWith(1, 'exception', {
      message: '不可加入',
      error: 'Forbidden',
      statusCode: 403,
      status: 'error',
      cause,
    });
    expect(emit).toHaveBeenNthCalledWith(2, 'exception', {
      message: '衝突',
      code: 'conflictCode',
      statusCode: 409,
      status: 'error',
      cause,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('驗證錯誤送出翻譯後的 badRequest', () => {
    const { emit, catch: handle } = setup();

    handle(new I18nValidationException([]));

    expect(emit).toHaveBeenCalledWith('exception', {
      message: 'en:common.exceptions.badRequest',
      statusCode: 400,
      status: 'error',
      cause,
    });
  });

  it('限流送出翻譯後的 tooManyRequests', () => {
    const { emit, catch: handle } = setup();

    handle(new ThrottlerException());

    expect(emit).toHaveBeenCalledWith('exception', {
      message: 'en:common.exceptions.tooManyRequests',
      statusCode: 429,
      status: 'error',
      cause,
    });
  });

  it('未知錯誤在 production 送出翻譯後的 internalServerError 並記錄', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { emit, logError, catch: handle } = setup();
    const error = new Error('db down');

    handle(error);

    expect(emit).toHaveBeenCalledWith('exception', {
      message: 'en:common.exceptions.internalServerError',
      statusCode: 500,
      status: 'error',
      cause,
    });
    expect(logError).toHaveBeenCalledWith(error);
  });

  it('未知錯誤在非 production 帶原訊息與 stack', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { emit, catch: handle } = setup();
    const error = new Error('db down');

    handle(error);

    expect(emit).toHaveBeenCalledWith('exception', {
      message: 'db down',
      stack: error.stack,
      statusCode: 500,
      status: 'error',
      cause,
    });
  });

  it.each([
    ['已解析的 i18n context', { i18nContext: { lang: 'ja' } }, 'ja'],
    ['handshake 的 x-lang', { headers: { 'x-lang': 'zh-HK' } }, 'zh-TW'],
    [
      'handshake 的 Accept-Language',
      { headers: { 'accept-language': 'ko' } },
      'ko',
    ],
    ['都沒有時交給預設語系', { headers: {} }, 'undefined'],
  ])('語系取自%s', (_, options, lang) => {
    const { emit, catch: handle } = setup(options);

    handle(new ThrottlerException());

    expect(emit).toHaveBeenCalledWith(
      'exception',
      expect.objectContaining({
        message: `${lang}:common.exceptions.tooManyRequests`,
      }),
    );
  });

  it.each([
    [{ orderId: 'o1', accessToken: 'secret' }, { orderId: 'o1' }],
    ['org', 'org'],
    [null, null],
  ])('cause 不回傳 accessToken：%j', (data, expected) => {
    const { emit, catch: handle } = setup({ data });

    handle(new WsException('bad'));

    expect(emit).toHaveBeenCalledWith(
      'exception',
      expect.objectContaining({
        cause: { pattern: 'joinWaitlist', data: expected },
      }),
    );
  });

  it('cause 無法送出時改送不含 cause 的訊息', () => {
    const { emit, catch: handle } = setup();
    emit.mockImplementationOnce(() => {
      throw new RangeError('Maximum call stack size exceeded');
    });

    handle(new WsException('bad'));

    expect(emit).toHaveBeenLastCalledWith('exception', {
      message: 'bad',
      status: 'error',
      cause: undefined,
    });
  });
});
