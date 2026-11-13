import * as crypto from 'crypto';

import {
  CheckoutEcpayDto,
  CheckoutEcpayResponseDto,
} from '../dto/checkout-ecpay.dto.js';
import { getEcpayMode } from '../ecpay.config.js';
import { ECPAY_PAYMENT_ROUTES } from '../ecpay-payment-routes.js';

import { EcpayMode } from '../types/ecpay.types.js';

import {
  toEcpayTradeDate,
  toEcpayTradeFields,
  truncate,
} from '../utils/ecpay.js';

import type { OrderResponseDto } from '../../orders/dto/order-response.dto.js';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayBaseApiUrl = (mode: EcpayMode): string => {
  return mode === 'Test'
    ? 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
    : 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
};

const REMARK_MAX_LENGTH = 100;

const toStringRecord = (input: Record<string, any>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(input).map(([key, val]) => [key, String(val)]),
  );

@Injectable()
export class EcpayBaseService {
  private readonly merchantId: string;
  private readonly hashKey: string;
  private readonly hashIV: string;
  private readonly apiUrl: string;
  private readonly returnUrl: string;
  private readonly resultUrl: string;
  private readonly backUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.merchantId = configService.getOrThrow('ECPAY_BASE_MERCHANT_ID');
    this.hashKey = configService.getOrThrow('ECPAY_BASE_HASH_KEY');
    this.hashIV = configService.getOrThrow('ECPAY_BASE_HASH_IV');

    this.apiUrl = getEcpayBaseApiUrl(getEcpayMode(configService));

    this.returnUrl = configService.getOrThrow('ECPAY_BASE_RETURN_URL');
    this.resultUrl = new URL('./result', this.returnUrl).toString();
    this.backUrl = new URL('./back/', this.returnUrl).toString();
  }

  generateCheckMacValue(params: Record<string, string>): string {
    const sorted = Object.keys(params).sort((a, b) =>
      a.toLowerCase() < b.toLowerCase() ? -1 : 1,
    );
    const raw = `HashKey=${this.hashKey}&${sorted.map((k) => `${k}=${params[k]}`).join('&')}&HashIV=${this.hashIV}`;
    const urlEncoded = encodeURIComponent(raw)
      .replace(
        /[!'()*~]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      )
      .toLowerCase()
      .replace(/%20/g, '+')
      .replace(/%2d/g, '-')
      .replace(/%5f/g, '_')
      .replace(/%2e/g, '.')
      .replace(/%21/g, '!')
      .replace(/%2a/g, '*')
      .replace(/%28/g, '(')
      .replace(/%29/g, ')');

    return crypto
      .createHash('sha256')
      .update(urlEncoded)
      .digest('hex')
      .toUpperCase();
  }

  aioCheckOutAll(
    order: OrderResponseDto & {
      confirmationNumber: string;
      merchantTradeNo: string;
    },
    base: Pick<CheckoutEcpayDto, 'Language' | 'TradeDesc'>,
    hasReturnUrl: boolean,
  ): CheckoutEcpayResponseDto {
    const choosePayment =
      ECPAY_PAYMENT_ROUTES[order.paymentMethod]?.choosePayment;

    const raw = {
      ...base,
      ...toEcpayTradeFields(order, base.TradeDesc),
      ChoosePayment: choosePayment,
      // 每次付款的 MerchantTradeNo 都不同，帶訂單編號讓綠界後台對得回訂單
      CustomField1: order.confirmationNumber,
      ...(choosePayment === 'DigitalPayment' && {
        ChooseSubPayment: order.paymentMethod,
      }),
      EncryptType: '1',
      MerchantID: this.merchantId,
      MerchantTradeDate: toEcpayTradeDate(),
      MerchantTradeNo: order.merchantTradeNo,
      NeedExtraPaidInfo: 'Y',
      // 綠界拒收含 & 的網址，前台網址存在付款嘗試上，這裡只給以交易編號查回的後端網址
      ...(hasReturnUrl && {
        ClientBackURL: new URL(order.merchantTradeNo, this.backUrl).toString(),
      }),
      OrderResultURL: this.resultUrl,
      PaymentType: 'aio',
      ...(order.customer.remark && {
        Remark: truncate(order.customer.remark, REMARK_MAX_LENGTH),
      }),
      ReturnURL: this.returnUrl,
    };

    const payload = toStringRecord(raw);
    payload.CheckMacValue = this.generateCheckMacValue(payload);

    return { action: this.apiUrl, fields: payload };
  }

  isCheckMacValueValid({
    CheckMacValue,
    ...rest
  }: Record<string, string>): '1|OK' | '0|FAIL' {
    const payload = toStringRecord(rest);
    const expected = Buffer.from(this.generateCheckMacValue(payload));
    const actual = Buffer.from(String(CheckMacValue ?? ''));

    if (expected.length !== actual.length) return '0|FAIL';

    return crypto.timingSafeEqual(expected, actual) ? '1|OK' : '0|FAIL';
  }
}
