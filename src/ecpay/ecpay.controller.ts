import {
  CheckoutEcpayDto,
  CheckoutEcpayResponseDto,
} from './dto/checkout-ecpay.dto';
import { IssueInvoiceEcpayDecryptedRequestDto } from './dto/issue-invoice-ecpay.dto';
import { ReturnEcpayDto } from './dto/return-ecpay.dto';

import { OrdersService } from '../orders/orders.service';

import { EcpayAddInvoiceWordSettingService } from './services/ecpay-add-invoice-word-setting.service';
import { EcpayBaseService } from './services/ecpay-base.service';
import { EcpayGetGovInvoiceWordSettingService } from './services/ecpay-get-gov-invoice-word-setting.service';
import { EcpayGetInvoiceWordSettingService } from './services/ecpay-get-invoice-word-setting.service';
import { EcpayIssueInvoiceService } from './services/ecpay-issue-invoice.service';
import { EcpayUpdateInvoiceWordStatusService } from './services/ecpay-update-invoice-word-status.service';

import { Body, Controller, Post, Query, Redirect } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiCreatedResponse } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@Controller('ecpay')
export class EcpayController {
  constructor(
    private readonly ecpayBaseService: EcpayBaseService,
    private readonly ecpayGetGovInvoiceWordSettingService: EcpayGetGovInvoiceWordSettingService,
    private readonly ecpayGetInvoiceWordSettingService: EcpayGetInvoiceWordSettingService,
    private readonly ecpayAddInvoiceWordSettingService: EcpayAddInvoiceWordSettingService,
    private readonly ecpayUpdateInvoiceWordStatusService: EcpayUpdateInvoiceWordStatusService,
    private readonly ecpayIssueInvoiceService: EcpayIssueInvoiceService,
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

  @Post('get-gov-invoice-word-setting')
  async getGovInvoiceWordSetting() {
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);
    const invoiceTerm = Math.floor(now.getMonth() / 2) + 1;
    const rocYear = (now.getFullYear() - 1911).toString();

    const { InvoiceInfo: govInvoiceInfo } =
      await this.ecpayGetGovInvoiceWordSettingService.getGovInvoiceWordSetting({
        rocYear,
        timestamp,
      });

    const { InvoiceInfo: existingInvoiceInfo } =
      await this.ecpayGetInvoiceWordSettingService.getInvoiceWordSetting({
        invoiceTerm,
        rocYear,
        timestamp,
      });

    // const existingKeySet = new Set(
    //   existingInvoiceInfo.map(
    //     ({ InvoiceTerm, InvType, InvoiceHeader, InvoiceStart, InvoiceEnd }) =>
    //       JSON.stringify({
    //         InvoiceTerm,
    //         InvType,
    //         InvoiceHeader,
    //         InvoiceStart,
    //         InvoiceEnd,
    //       }),
    //   ),
    // );

    // console.log(existingKeySet);

    // const toBeAdded = govInvoiceInfo
    //   .filter(({ InvoiceTerm }) => Number(InvoiceTerm) === invoiceTerm)
    //   .filter(
    //     ({ InvoiceTerm, InvType, InvoiceHeader, InvoiceStart, InvoiceEnd }) =>
    //       !existingKeySet.has(
    //         JSON.stringify({
    //           InvoiceTerm,
    //           InvType,
    //           InvoiceHeader,
    //           InvoiceStart,
    //           InvoiceEnd,
    //         }),
    //       ),
    //   );

    const makeKey = (item: {
      InvoiceTerm: string | number;
      InvType: string;
      InvoiceHeader: string;
      InvoiceStart: string;
      InvoiceEnd: string;
    }) =>
      JSON.stringify({
        InvoiceTerm: String(item.InvoiceTerm),
        InvType: String(item.InvType),
        InvoiceHeader: String(item.InvoiceHeader),
        InvoiceStart: String(item.InvoiceStart),
        InvoiceEnd: String(item.InvoiceEnd),
      });

    const existingMap = new Map(
      existingInvoiceInfo.map((item) => [
        makeKey({
          InvoiceTerm: item.InvoiceTerm,
          InvType: item.InvType,
          InvoiceHeader: item.InvoiceHeader,
          InvoiceStart: item.InvoiceStart,
          InvoiceEnd: item.InvoiceEnd,
        }),
        item.TrackID,
      ]),
    );

    const toBeAdded = govInvoiceInfo
      .filter(({ InvoiceTerm }) => Number(InvoiceTerm) === invoiceTerm)
      .map((item) => {
        const key = makeKey(item);
        console.log(item, key);
        const trackID = existingMap.get(key);
        return {
          ...item,
          TrackID: trackID,
        };
      });

    // console.log(existingInvoiceInfo);

    if (toBeAdded.length === 0) return;

    // const addResults = [];

    // for (const info of toBeAdded) {
    //   const result =
    //     await this.ecpayAddInvoiceWordSettingService.addInvoiceWordSetting({
    //       invoiceInfo: info,
    //       rocYear,
    //       timestamp,
    //     });
    //   console.log(result);

    // const updateResult =
    //   await this.ecpayUpdateInvoiceWordStatusService.updateInvoiceWordStatus(
    //     result.TrackID,
    //   );

    // console.log(updateResult);

    // addResults.push({
    //   InvoiceHeader: info.InvoiceHeader,
    //   AddResult: result,
    //   UpdateResult: updateResult,
    // });
    // }

    // return addResults;
  }

  @Post('issue-invoice')
  issueInvoice(@Body() dto: IssueInvoiceEcpayDecryptedRequestDto) {
    return this.ecpayIssueInvoiceService.issueInvoice(dto);
  }
}
