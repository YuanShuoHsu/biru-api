// https://docs.nestjs.com/websockets/exception-filters

import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  IntrinsicException,
} from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

import { I18nContext, I18nService, I18nValidationException } from 'nestjs-i18n';
import type { Socket } from 'socket.io';
import type { I18nTranslations } from '../../generated/i18n.generated.js';
import { LanguageResolver } from '../resolvers/language.resolver.js';

const languageResolver = new LanguageResolver();

const withoutAccessToken = (data: unknown) =>
  typeof data === 'object' && data !== null && 'accessToken' in data
    ? Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== 'accessToken'),
      )
    : data;

@Catch()
export class AllWsExceptionsFilter extends BaseWsExceptionFilter {
  constructor(private readonly i18n: I18nService<I18nTranslations>) {
    super({
      causeFactory: (pattern, data) => ({
        pattern,
        data: withoutAccessToken(data),
      }),
    });
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ws = host.switchToWs();
    const pattern = ws.getPattern();

    if (
      !(exception instanceof IntrinsicException) &&
      !(exception instanceof WsException)
    )
      AllWsExceptionsFilter.logger.error(
        `WebSocket 訊息處理失敗：${pattern}`,
        exception,
      );

    const lang =
      I18nContext.current(host)?.lang ?? languageResolver.resolve(host);

    const isProduction = process.env.NODE_ENV === 'production';

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : exception instanceof WsException
          ? undefined
          : HttpStatus.INTERNAL_SERVER_ERROR;

    const error =
      statusCode === Number(HttpStatus.TOO_MANY_REQUESTS)
        ? this.i18n.t('common.exceptions.tooManyRequests', { lang })
        : exception instanceof I18nValidationException
          ? this.i18n.t('common.exceptions.badRequest', { lang })
          : exception instanceof HttpException
            ? exception.getResponse()
            : exception instanceof WsException
              ? exception.getError()
              : isProduction
                ? this.i18n.t('common.exceptions.internalServerError', {
                    lang,
                  })
                : {
                    message:
                      exception instanceof Error
                        ? exception.message
                        : String(exception),
                    stack:
                      exception instanceof Error
                        ? exception.stack
                        : String(exception),
                  };

    const client = ws.getClient<Socket>();

    const payload = {
      ...(typeof error === 'string' ? { message: error } : error),
      statusCode,
      status: 'error',
      cause: this.options.causeFactory?.(pattern, ws.getData()),
    };

    try {
      this.emitMessage(client, 'exception', payload);
    } catch {
      this.emitMessage(client, 'exception', { ...payload, cause: undefined });
    }
  }
}
