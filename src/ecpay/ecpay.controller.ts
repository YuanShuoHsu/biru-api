import {
  CheckBarcodeEcpayDto,
  CheckBarcodeEcpayResponseDto,
} from './dto/check-barcode-ecpay.dto';
import {
  CheckoutEcpayDto,
  CheckoutEcpayResponseDto,
} from './dto/checkout-ecpay.dto';
import { ReturnEcpayDto } from './dto/return-ecpay.dto';
import { SyncInvoiceWordSettingResultDto } from './dto/sync-invoice-word-setting-result.dto';

import { OrdersService } from '../orders/orders.service';

import { EcpayBaseService } from './services/ecpay-base.service';
import { EcpayCallbackLogService } from './services/ecpay-callback-log.service';
import { EcpayCheckBarcodeService } from './services/ecpay-check-barcode.service';
import { EcpaySyncInvoiceWordSettingsService } from './services/ecpay-sync-invoice-word-settings.service';

import {
  Body,
  Controller,
  Logger,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiCreatedResponse, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { AdminGuard } from 'src/common/guards/admin.guard';

@Controller('ecpay')
export class EcpayController {
  private readonly logger = new Logger(EcpayController.name);

  constructor(
    private readonly ecpayBaseService: EcpayBaseService,
    private readonly ecpayCallbackLogService: EcpayCallbackLogService,
    private readonly ecpayCheckBarcodeService: EcpayCheckBarcodeService,
    private readonly ecpaySyncInvoiceWordSettingsService: EcpaySyncInvoiceWordSettingsService,
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
  ) {}

  private getSafeRedirectUrl(redirect: string): string {
    const fallbackUrl = this.configService.getOrThrow<string>('NEXT_URL');
    const allowedOrigins = [
      fallbackUrl,
      this.configService.getOrThrow<string>('NEXT_ADMIN_URL'),
    ].map((url) => new URL(url).origin);

    try {
      if (allowedOrigins.includes(new URL(redirect).origin)) return redirect;
    } catch {
      // redirect 不是合法 URL，落入 fallback
    }

    return fallbackUrl;
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

      if (await this.ordersService.recordPaymentResult(body))
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
  async checkout(@Body() dto: CheckoutEcpayDto) {
    const { orderId, ...base } = dto;
    const order = await this.ordersService.getPayableOrder(orderId);

    return this.ecpayBaseService.aioCheckOutAll(order, base);
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
  async result(
    @Query('redirect') redirect: string,
    @Body() body: Record<string, string>,
  ) {
    const result = this.ecpayBaseService.isCheckMacValueValid(body);

    await this.handleCallback('result', body, result);

    return { statusCode: 303, url: this.getSafeRedirectUrl(redirect) };
  }

  @Post('sync-invoice-word-settings')
  @UseGuards(AdminGuard)
  @ApiCreatedResponse({ type: [SyncInvoiceWordSettingResultDto] })
  @ApiOperation({ summary: '以財政部配號同步綠界字軌（新增缺少的並啟用）' })
  syncInvoiceWordSettings(): Promise<SyncInvoiceWordSettingResultDto[]> {
    return this.ecpaySyncInvoiceWordSettingsService.sync();
  }
}
