// https://docs.nestjs.com/exception-filters

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

import { I18nContext } from 'nestjs-i18n';
import type { I18nTranslations } from 'src/generated/i18n.generated';

@Catch()
export class AllExceptionsFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(private readonly adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;

    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const i18n = I18nContext.current<I18nTranslations>(host);

    const isProduction = process.env.NODE_ENV === 'production';

    const message =
      httpStatus === Number(HttpStatus.TOO_MANY_REQUESTS)
        ? {
            message: i18n?.t('common.exceptions.tooManyRequests', {
              lang: i18n?.lang,
            }),
          }
        : exception instanceof HttpException
          ? exception.getResponse()
          : isProduction
            ? {
                message: i18n?.t('common.exceptions.internalServerError', {
                  lang: i18n?.lang,
                }),
              }
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

    const responseBody = {
      message,
      path: String(httpAdapter.getRequestUrl(ctx.getRequest())),
      statusCode: httpStatus,
      success: false,
      timestamp: new Date().toISOString(),
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
