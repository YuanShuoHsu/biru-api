import { firstValueFrom } from 'rxjs';

import type { DoActionEcpayResponseDto } from '../dto/do-action-ecpay.dto';
import { ECPAY_DO_ACTION } from '../dto/do-action-ecpay.dto';

import { EcpayMode } from '../types/ecpay.types';

import { EcpayBaseService } from './ecpay-base.service';

import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ECPAY_DO_ACTION_API_URL =
  'https://payment.ecpay.com.tw/CreditDetail/DoAction';

/**
 * 請求送出後失去回應，綠界可能已經受理。
 * 呼叫端必須保留退款紀錄等待對帳，刪掉的話這筆錢就查無此事了。
 */
export class EcpayResultUnknownError extends Error {
  constructor(cause: unknown) {
    super(
      `ECPay DoAction result unknown: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

@Injectable()
export class EcpayDoActionService {
  private readonly merchantId: string;
  private readonly mode: EcpayMode;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly ecpayBaseService: EcpayBaseService,
  ) {
    this.merchantId = configService.getOrThrow('ECPAY_BASE_MERCHANT_ID');
    this.mode = configService.getOrThrow<EcpayMode>('ECPAY_OPERATION_MODE');
  }

  get isAvailable(): boolean {
    return this.mode !== 'Test';
  }

  /** 退刷；金額可小於原授權金額（分期與紅利折抵除外，那兩種必須全額退） */
  async refund(params: {
    amount: number;
    merchantTradeNo: string;
    tradeNo: string;
  }): Promise<DoActionEcpayResponseDto> {
    if (!this.isAvailable)
      throw new ServiceUnavailableException(
        'ECPay DoAction has no test environment; refunds can only be issued in production',
      );

    const payload: Record<string, string> = {
      Action: ECPAY_DO_ACTION.Refund,
      MerchantID: this.merchantId,
      MerchantTradeNo: params.merchantTradeNo,
      TotalAmount: String(params.amount),
      TradeNo: params.tradeNo,
    };
    payload.CheckMacValue =
      this.ecpayBaseService.generateCheckMacValue(payload);

    const { data } = await firstValueFrom(
      this.httpService.post<string>(
        ECPAY_DO_ACTION_API_URL,
        new URLSearchParams(payload).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    ).catch((error) => {
      throw new EcpayResultUnknownError(error);
    });

    const parsed = Object.fromEntries(
      new URLSearchParams(data),
    ) as unknown as DoActionEcpayResponseDto;

    if (!parsed.RtnCode)
      throw new EcpayResultUnknownError(
        new Error(`Unexpected DoAction response: ${data}`),
      );

    if (parsed.RtnCode !== '1') throw new Error(parsed.RtnMsg);

    return parsed;
  }
}
