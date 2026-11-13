// https://developers.ecpay.com.tw/22752/
// https://developers.ecpay.com.tw/22762/
// https://developers.ecpay.com.tw/23004/

import { firstValueFrom } from 'rxjs';

import { getEcpayMode } from '../ecpay.config.js';
import {
  ECPAY_PAYMENT_ROUTES,
  isEmbeddedPaymentMethod,
} from '../ecpay-payment-routes.js';

import { EcpayMode } from '../types/ecpay.types.js';

import {
  decodeUrlEncoded,
  decryptData,
  EcpayRejectedError,
  encryptData,
  toEcpayTradeDate,
  toEcpayTradeFields,
} from '../utils/ecpay.js';

import type { OrderResponseDto } from '../../orders/dto/order-response.dto.js';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayEmbeddedApiUrl = (mode: EcpayMode): string =>
  mode === 'Test'
    ? 'https://ecpg-stage.ecpay.com.tw/Merchant/'
    : 'https://ecpg.ecpay.com.tw/Merchant/';

interface EmbeddedEncryptedResponse {
  TransCode: number;
  TransMsg: string;
  Data: string;
}

interface EmbeddedResult {
  RtnCode: number;
  RtnMsg: string;
}

export interface EmbeddedTokenResult extends EmbeddedResult {
  Token: string;
  TokenExpireDate: string;
}

export interface EmbeddedPaymentResult extends EmbeddedResult {
  OrderInfo: { MerchantTradeNo: string; TradeNo?: string };
  ThreeDInfo?: { ThreeDURL: string };
  TWQRlInfo?: { QRcode: string; RedirectURL: string };
  UnionPayInfo?: { UnionPayURL: string };
}

@Injectable()
export class EcpayEmbeddedService {
  private readonly merchantId: string;
  private readonly hashKey: string;
  private readonly hashIV: string;
  private readonly apiUrl: string;
  private readonly returnUrl: string;
  private readonly orderResultUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.merchantId = configService.getOrThrow('ECPAY_BASE_MERCHANT_ID');
    this.hashKey = configService.getOrThrow('ECPAY_BASE_HASH_KEY');
    this.hashIV = configService.getOrThrow('ECPAY_BASE_HASH_IV');

    this.apiUrl = getEcpayEmbeddedApiUrl(getEcpayMode(configService));

    const baseReturnUrl = configService.getOrThrow<string>(
      'ECPAY_BASE_RETURN_URL',
    );
    this.returnUrl = new URL('./embedded/return', baseReturnUrl).toString();
    this.orderResultUrl = new URL(
      './embedded/result',
      baseReturnUrl,
    ).toString();
  }

  private async post<T extends EmbeddedResult>(
    path: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    const {
      data: { Data, TransCode, TransMsg },
    } = await firstValueFrom(
      this.httpService.post<EmbeddedEncryptedResponse>(
        new URL(path, this.apiUrl).toString(),
        {
          MerchantID: this.merchantId,
          RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
          Data: encryptData(
            encodeURIComponent(
              JSON.stringify({ MerchantID: this.merchantId, ...data }),
            ),
            this.hashKey,
            this.hashIV,
          ),
        },
        // https://developers.ecpay.com.tw/22762/
        { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 },
      ),
    );

    if (TransCode !== 1) throw new EcpayRejectedError(TransMsg);

    const parsed = JSON.parse(
      decodeUrlEncoded(decryptData(Data, this.hashKey, this.hashIV)),
    ) as T;

    if (parsed.RtnCode !== 1) throw new EcpayRejectedError(parsed.RtnMsg);

    return parsed;
  }

  async getTokenbyTrade(
    order: Pick<OrderResponseDto, 'discount' | 'items' | 'paymentMethod'> & {
      confirmationNumber: string;
      merchantTradeNo: string;
    },
    tradeDesc: string,
  ): Promise<EmbeddedTokenResult> {
    const { paymentMethod } = order;
    if (!isEmbeddedPaymentMethod(paymentMethod))
      throw new Error(`${paymentMethod} is not an embedded payment method`);

    const { choosePaymentList } = ECPAY_PAYMENT_ROUTES[paymentMethod];
    const resultUrl = { OrderResultURL: this.orderResultUrl };

    return this.post<EmbeddedTokenResult>('GetTokenbyTrade', {
      RememberCard: 0,
      PaymentUIType: 2,
      ChoosePaymentList: choosePaymentList,
      OrderInfo: {
        MerchantTradeDate: toEcpayTradeDate(),
        MerchantTradeNo: order.merchantTradeNo,
        ReturnURL: this.returnUrl,
        ...toEcpayTradeFields(order, tradeDesc),
      },
      ...(paymentMethod === 'Credit' && { CardInfo: resultUrl }),
      ...(paymentMethod === 'TWQR' && { EPaymentInfo: resultUrl }),
      CustomField: order.confirmationNumber,
    });
  }

  createPayment(
    payToken: string,
    merchantTradeNo: string,
  ): Promise<EmbeddedPaymentResult> {
    return this.post<EmbeddedPaymentResult>('CreatePayment', {
      PayToken: payToken,
      MerchantTradeNo: merchantTradeNo,
    });
  }
}
