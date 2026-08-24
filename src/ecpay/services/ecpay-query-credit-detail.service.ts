import { firstValueFrom } from 'rxjs';

import type { QueryCreditDetailEcpayResponseDto } from '../dto/query-credit-detail-ecpay.dto';

import { getEcpayMode } from '../ecpay.config';

import { EcpayMode } from '../types/ecpay.types';

import { EcpayBaseService } from './ecpay-base.service';
import { EcpayRateLimitedError } from './ecpay-query-trade-info.service';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';

const ECPAY_QUERY_CREDIT_DETAIL_API_URL =
  'https://payment.ecpay.com.tw/CreditDetail/QueryTrade/V2';

@Injectable()
export class EcpayQueryCreditDetailService {
  private readonly merchantId: string;
  private readonly checkCode: string | undefined;
  private readonly mode: EcpayMode;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly ecpayBaseService: EcpayBaseService,
  ) {
    this.merchantId = configService.getOrThrow('ECPAY_BASE_MERCHANT_ID');
    this.checkCode = configService.get('ECPAY_CREDIT_CHECK_CODE');
    this.mode = getEcpayMode(configService);
  }

  /** 與 DoAction 一樣沒有測試環境，且商家檢查碼要另外從綠界後台取得 */
  get isAvailable(): boolean {
    return this.mode !== 'Test' && !!this.checkCode;
  }

  async queryCreditDetail(params: {
    amount: number;
    authorizationNo: string;
  }): Promise<QueryCreditDetailEcpayResponseDto> {
    const payload: Record<string, string> = {
      CreditAmount: String(params.amount),
      CreditCheckCode: this.checkCode!,
      CreditRefundId: params.authorizationNo,
      MerchantID: this.merchantId,
    };
    payload.CheckMacValue =
      this.ecpayBaseService.generateCheckMacValue(payload);

    const { data } = await firstValueFrom(
      this.httpService.post<QueryCreditDetailEcpayResponseDto | string>(
        ECPAY_QUERY_CREDIT_DETAIL_API_URL,
        new URLSearchParams(payload).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    ).catch((error: AxiosError) => {
      if (error.response?.status === 403) throw new EcpayRateLimitedError();
      throw error;
    });

    const parsed: unknown = typeof data === 'string' ? JSON.parse(data) : data;

    if (!parsed || typeof parsed !== 'object' || !('RtnValue' in parsed))
      throw new Error(
        `Unexpected query credit detail response: ${JSON.stringify(data)}`,
      );

    return parsed as QueryCreditDetailEcpayResponseDto;
  }
}
