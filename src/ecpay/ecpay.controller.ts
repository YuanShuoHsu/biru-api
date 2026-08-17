import {
  CheckBarcodeEcpayDto,
  CheckBarcodeEcpayResponseDto,
} from './dto/check-barcode-ecpay.dto';
import {
  CheckoutEcpayDto,
  CheckoutEcpayResponseDto,
} from './dto/checkout-ecpay.dto';
import { ReturnEcpayDto } from './dto/return-ecpay.dto';

import { OrdersService } from '../orders/orders.service';

import { EcpayBaseService } from './services/ecpay-base.service';
import { EcpayCheckBarcodeService } from './services/ecpay-check-barcode.service';
import type { SyncInvoiceWordSettingResultDto } from './services/ecpay-sync-invoice-word-settings.service';
import { EcpaySyncInvoiceWordSettingsService } from './services/ecpay-sync-invoice-word-settings.service';

import {
  Body,
  Controller,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiCreatedResponse } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { AdminGuard } from 'src/common/guards/admin.guard';

@Controller('ecpay')
export class EcpayController {
  constructor(
    private readonly ecpayBaseService: EcpayBaseService,
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
  @ApiBody({ type: ReturnEcpayDto })
  async return(@Body() body: Record<string, string>) {
    const result = this.ecpayBaseService.isCheckMacValueValid(body);

    if (result === '1|OK') await this.ordersService.recordPaymentResult(body);

    return result;
  }

  @Post('result')
  @AllowAnonymous()
  @ApiBody({ type: ReturnEcpayDto })
  @Redirect()
  async result(
    @Query('redirect') redirect: string,
    @Body() body: Record<string, string>,
  ) {
    const result = this.ecpayBaseService.isCheckMacValueValid(body);

    if (result === '1|OK') await this.ordersService.recordPaymentResult(body);

    return { statusCode: 303, url: this.getSafeRedirectUrl(redirect) };
  }

  @Post('sync-invoice-word-settings')
  @UseGuards(AdminGuard)
  syncInvoiceWordSettings(): Promise<SyncInvoiceWordSettingResultDto[]> {
    return this.ecpaySyncInvoiceWordSettingsService.sync();
  }
}
