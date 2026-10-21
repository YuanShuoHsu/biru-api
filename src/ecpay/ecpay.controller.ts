import {
  CheckBarcodeEcpayDto,
  CheckBarcodeEcpayResponseDto,
} from './dto/check-barcode-ecpay.dto.js';
import {
  CheckoutEcpayDto,
  CheckoutEcpayResponseDto,
} from './dto/checkout-ecpay.dto.js';
import { ReturnEcpayDto } from './dto/return-ecpay.dto.js';
import { SyncInvoiceWordSettingResultDto } from './dto/sync-invoice-word-setting-result.dto.js';

import { OrdersService } from '../orders/orders.service.js';

import { EcpayBaseService } from './services/ecpay-base.service.js';
import { EcpayCallbackLogService } from './services/ecpay-callback-log.service.js';
import { EcpayCheckBarcodeService } from './services/ecpay-check-barcode.service.js';
import { EcpaySyncInvoiceWordSettingsService } from './services/ecpay-sync-invoice-word-settings.service.js';

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiCreatedResponse, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';

import { AdminGuard } from '../common/guards/admin.guard.js';

@Controller('ecpay')
export class EcpayController {
  private readonly logger = new Logger(EcpayController.name);
  private readonly allowedOrigins: string[];
  private readonly fallbackUrl: string;

  constructor(
    private readonly ecpayBaseService: EcpayBaseService,
    private readonly ecpayCallbackLogService: EcpayCallbackLogService,
    private readonly ecpayCheckBarcodeService: EcpayCheckBarcodeService,
    private readonly ecpaySyncInvoiceWordSettingsService: EcpaySyncInvoiceWordSettingsService,
    private readonly ordersService: OrdersService,
    configService: ConfigService,
  ) {
    this.fallbackUrl = configService.getOrThrow<string>('NEXT_URL');
    this.allowedOrigins = [
      this.fallbackUrl,
      configService.getOrThrow<string>('NEXT_ADMIN_URL'),
    ].map((url) => new URL(url).origin);
  }

  private isAllowedUrl(value: string): boolean {
    try {
      return this.allowedOrigins.includes(new URL(value).origin);
    } catch {
      return false;
    }
  }

  private async getReturnUrl(
    merchantTradeNo: string | undefined,
  ): Promise<string> {
    const returnUrl = merchantTradeNo
      ? await this.ordersService.findPaymentReturnUrl(merchantTradeNo)
      : null;

    return returnUrl && this.isAllowedUrl(returnUrl)
      ? returnUrl
      : this.fallbackUrl;
  }

  private async handleCallback(
    endpoint: 'return' | 'result',
    body: Record<string, string>,
    macResult: '1|OK' | '0|FAIL',
  ): Promise<boolean> {
    const macValid = macResult === '1|OK';

    let logId: string | undefined;

    try {
      logId = await this.ecpayCallbackLogService.record({
        endpoint,
        macValid,
        merchantTradeNo: body.MerchantTradeNo,
        rawBody: body,
      });

      if (!macValid) {
        this.logger.warn(
          `綠界 ${endpoint} 通知驗簽失敗：${body.MerchantTradeNo ?? '(無交易編號)'}`,
        );

        return true;
      }

      const outcome = await this.ordersService.recordPaymentResult(body);

      if (outcome === 'unmatched') {
        await this.ecpayCallbackLogService.markFailed(
          logId,
          '通知未對應到可認列的訂單',
        );

        return false;
      }

      if (outcome === 'handled')
        await this.ecpayCallbackLogService.markHandled(logId);

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `綠界 ${endpoint} 通知處理失敗：${body.MerchantTradeNo ?? '(無交易編號)'}`,
        error,
      );

      await (
        logId
          ? this.ecpayCallbackLogService.markFailed(logId, message)
          : this.ecpayCallbackLogService.record({
              endpoint,
              error: message,
              macValid,
              merchantTradeNo: body.MerchantTradeNo,
              rawBody: body,
            })
      ).catch(() => undefined);

      return false;
    }
  }

  @Post()
  @AllowAnonymous()
  @ApiCreatedResponse({ type: CheckoutEcpayResponseDto })
  async checkout(
    @Body() dto: CheckoutEcpayDto,
    @Session() session: UserSession | null,
  ) {
    const { accessToken, orderId, returnUrl, ...base } = dto;

    if (returnUrl && !this.isAllowedUrl(returnUrl))
      throw new BadRequestException('returnUrl is not allowed');

    if (
      !(await this.ordersService.canReadOrderById(
        orderId,
        session?.user.id ?? null,
        accessToken ?? null,
      ))
    )
      throw new ForbiddenException();

    const order = await this.ordersService.createPaymentAttempt(
      orderId,
      returnUrl ?? null,
    );

    return this.ecpayBaseService.aioCheckOutAll(order, base, !!returnUrl);
  }

  @Post('check-barcode')
  @AllowAnonymous()
  @ApiCreatedResponse({ type: CheckBarcodeEcpayResponseDto })
  async checkBarcode(
    @Body() { barCode }: CheckBarcodeEcpayDto,
  ): Promise<CheckBarcodeEcpayResponseDto> {
    return {
      isExist: await this.ecpayCheckBarcodeService.checkBarcode(barCode),
    };
  }

  @Post('return')
  @AllowAnonymous()
  @HttpCode(200)
  @SkipThrottle()
  @ApiBody({ type: ReturnEcpayDto })
  async return(@Body() body: Record<string, string>) {
    const result = this.ecpayBaseService.isCheckMacValueValid(body);

    return (await this.handleCallback('return', body, result))
      ? result
      : '0|FAIL';
  }

  @Post('result')
  @AllowAnonymous()
  @SkipThrottle()
  @ApiBody({ type: ReturnEcpayDto })
  @Redirect()
  async result(@Body() body: Record<string, string>) {
    const result = this.ecpayBaseService.isCheckMacValueValid(body);

    await this.handleCallback('result', body, result);

    return {
      statusCode: 303,
      url: await this.getReturnUrl(body.MerchantTradeNo),
    };
  }

  @Get('back/:merchantTradeNo')
  @AllowAnonymous()
  @SkipThrottle()
  @Redirect()
  async back(@Param('merchantTradeNo') merchantTradeNo: string) {
    return { statusCode: 303, url: await this.getReturnUrl(merchantTradeNo) };
  }

  @Post('sync-invoice-word-settings')
  @UseGuards(AdminGuard)
  @ApiCreatedResponse({ type: [SyncInvoiceWordSettingResultDto] })
  @ApiOperation({ summary: '以財政部配號同步綠界字軌（新增缺少的並啟用）' })
  syncInvoiceWordSettings(): Promise<SyncInvoiceWordSettingResultDto[]> {
    return this.ecpaySyncInvoiceWordSettingsService.sync();
  }
}
