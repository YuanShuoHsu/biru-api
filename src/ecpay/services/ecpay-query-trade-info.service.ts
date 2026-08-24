import { firstValueFrom } from 'rxjs';

import type { QueryTradeInfoEcpayResponseDto } from '../dto/query-trade-info-ecpay.dto';

import { getEcpayMode } from '../ecpay.config';

import { EcpayMode } from '../types/ecpay.types';

import { EcpayBaseService } from './ecpay-base.service';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';

const getEcpayQueryTradeInfoApiUrl = (mode: EcpayMode): string => {
  return mode === 'Test'
    ? 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5'
    : 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5';
};

export class EcpayRateLimitedError extends Error {
  constructor() {
    super('ECPay query trade info rate limited');
  }
}

@Injectable()
export class EcpayQueryTradeInfoService {
  private readonly merchantId: string;
  private readonly apiUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly ecpayBaseService: EcpayBaseService,
  ) {
    this.merchantId = configService.getOrThrow('ECPAY_BASE_MERCHANT_ID');

    this.apiUrl = getEcpayQueryTradeInfoApiUrl(getEcpayMode(configService));
  }

  async queryTradeInfo(
    merchantTradeNo: string,
  ): Promise<QueryTradeInfoEcpayResponseDto> {
    const params: Record<string, string> = {
      MerchantID: this.merchantId,
      MerchantTradeNo: merchantTradeNo,
      TimeStamp: String(Math.floor(Date.now() / 1000)),
    };
    params.CheckMacValue = this.ecpayBaseService.generateCheckMacValue(params);

    const { data } = await firstValueFrom(
      this.httpService.post<string>(
        this.apiUrl,
        new URLSearchParams(params).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      ),
    ).catch((error: AxiosError) => {
      if (error.response?.status === 403) throw new EcpayRateLimitedError();
      throw error;
    });

    const parsed = Object.fromEntries(
      new URLSearchParams(data),
    ) as QueryTradeInfoEcpayResponseDto;

    if (!parsed.TradeStatus)
      throw new Error(`Unexpected query trade info response: ${data}`);

    if (this.ecpayBaseService.isCheckMacValueValid(parsed) !== '1|OK')
      throw new Error(
        `Invalid CheckMacValue on query trade info response for ${merchantTradeNo}`,
      );

    return parsed;
  }
}
