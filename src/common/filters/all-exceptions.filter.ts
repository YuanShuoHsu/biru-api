// https://docs.nestjs.com/exception-filters

import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

import { I18nContext, I18nValidationException } from 'nestjs-i18n';
import type { I18nTranslations } from '../../generated/i18n.generated.js';
import { isUnstorableText } from '../utils/pg-errors.js';

@Catch()
export class AllExceptionsFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(private readonly adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(caught: unknown, host: ArgumentsHost): void {
    const i18n = I18nContext.current<I18nTranslations>(host);

    const exception =
      isUnstorableText(caught) || caught instanceof I18nValidationException
        ? new BadRequestException({
            error: 'Bad Request',
            code: 'badRequest',
            message: i18n?.t('common.exceptions.badRequest', {
              lang: i18n?.lang,
            }),
          })
        : caught;

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const isProduction = process.env.NODE_ENV === 'production';

    const message =
      httpStatus === Number(HttpStatus.TOO_MANY_REQUESTS)
        ? i18n?.t('common.exceptions.tooManyRequests', {
            lang: i18n?.lang,
          })
        : exception instanceof HttpException
          ? exception.getResponse()
          : isProduction
            ? i18n?.t('common.exceptions.internalServerError', {
                lang: i18n?.lang,
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

    const { httpAdapter } = this.adapterHost;

    const ctx = host.switchToHttp();

    const responseBody = {
      ...(typeof message === 'string' ? { message } : message),
      path: String(httpAdapter.getRequestUrl(ctx.getRequest())),
      statusCode: httpStatus,
      success: false,
      timestamp: new Date().toISOString(),
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
