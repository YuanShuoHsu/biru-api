import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(private readonly adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : isProduction
          ? { message: 'Internal server error' }
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

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

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
