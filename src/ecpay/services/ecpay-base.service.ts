import * as crypto from 'crypto';

import { CheckoutEcpayDto } from '../dto/checkout-ecpay.dto';
import { EcpayMode } from '../types/ecpay.types';

import type { OrderResponseDto } from '../../orders/dto/order-response.dto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayBaseApiUrl = (mode: EcpayMode): string => {
  return mode === 'Test'
    ? 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
    : 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
};

const ECPAY_CHOOSE_PAYMENT: Record<string, string> = {
  ApplePay: 'ApplePay',
  Credit: 'Credit',
  iPASS: 'DigitalPayment',
  Jkopay: 'DigitalPayment',
  TWQR: 'TWQR',
  WeiXin: 'WeiXin',
};

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

  constructor(private readonly configService: ConfigService) {
    this.merchantId = configService.getOrThrow('ECPAY_BASE_MERCHANT_ID');
    this.hashKey = configService.getOrThrow('ECPAY_BASE_HASH_KEY');
    this.hashIV = configService.getOrThrow('ECPAY_BASE_HASH_IV');

    const mode = this.configService.getOrThrow<EcpayMode>(
      'ECPAY_OPERATION_MODE',
    );
    this.apiUrl = getEcpayBaseApiUrl(mode);

    this.returnUrl = configService.getOrThrow('ECPAY_BASE_RETURN_URL');
  }

  private getEcpayDateString(): string {
    const taipei = new Date(Date.now() + 8 * 60 * 60 * 1000);

    return taipei
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')
      .replace(/-/g, '/');
  }

  private generateCheckMacValue(params: Record<string, string>): string {
    const sorted = Object.keys(params).sort();
    const raw = `HashKey=${this.hashKey}&${sorted.map((k) => `${k}=${params[k]}`).join('&')}&HashIV=${this.hashIV}`;
    const urlEncoded = encodeURIComponent(raw)
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
    order: OrderResponseDto & { confirmationNumber: string },
    base: Omit<CheckoutEcpayDto, 'orderId'>,
  ): string {
    const choosePayment = ECPAY_CHOOSE_PAYMENT[order.paymentMethod];

    const raw = {
      ...base,
      ChoosePayment: choosePayment,
      ...(choosePayment === 'DigitalPayment' && {
        ChooseSubPayment: order.paymentMethod,
      }),
      EncryptType: '1',
      MerchantID: this.merchantId,
      MerchantTradeDate: this.getEcpayDateString(),
      MerchantTradeNo: order.confirmationNumber,
      NeedExtraPaidInfo: 'Y',
      PaymentType: 'aio',
      ...(order.customerNotes && { Remark: order.customerNotes }),
      ReturnURL: this.returnUrl,
      TotalAmount: Math.round(
        order.items.reduce(
          (sum, { orderQuantity, unitPrice }) =>
            sum + Number(unitPrice) * orderQuantity,
          0,
        ),
      ),
    };

    const payload = toStringRecord(raw);
    payload.CheckMacValue = this.generateCheckMacValue(payload);

    const inputs = Object.entries(payload)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}" />`)
      .join('\n');

    return `<form id="ecpayForm" method="POST" action="${this.apiUrl}">
    ${inputs}
    </form>
    <script>document.getElementById('ecpayForm').submit();</script>`;
  }

  isCheckMacValueValid({
    CheckMacValue,
    ...rest
  }: Record<string, string>): '1|OK' | '0|FAIL' {
    const payload = toStringRecord(rest);
    const checkValue = this.generateCheckMacValue(payload);

    return checkValue === CheckMacValue ? '1|OK' : '0|FAIL';
  }
}
