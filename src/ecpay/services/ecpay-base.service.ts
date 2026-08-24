import * as crypto from 'crypto';

import {
  CheckoutEcpayDto,
  CheckoutEcpayResponseDto,
} from '../dto/checkout-ecpay.dto';
import { getEcpayMode } from '../ecpay.config';

import { EcpayMode } from '../types/ecpay.types';

import { sumOrderItems } from '../../common/utils/order-items';
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

const ITEM_NAME_MAX_LENGTH = 400;
const TRADE_DESC_MAX_LENGTH = 200;
const REMARK_MAX_LENGTH = 100;

const truncate = (value: string, maxLength: number): string =>
  [...value].slice(0, maxLength).join('');

const sanitize = (value: string): string =>
  // eslint-disable-next-line no-control-regex
  value.replace(/[#\u0000-\u001F]/g, ' ').trim();

const truncateItemName = (value: string): string => {
  const truncated = truncate(value, ITEM_NAME_MAX_LENGTH);
  if (truncated === value) return truncated;

  const lastSeparator = truncated.lastIndexOf('#');

  return lastSeparator > 0 ? truncated.slice(0, lastSeparator) : truncated;
};

const buildItemName = (items: OrderResponseDto['items']): string =>
  items
    .map(({ addOns, menuItemName, modifiers, orderQuantity }) => {
      const choices = [
        ...(modifiers ?? []).map(({ modifierName }) => modifierName),
        ...(addOns ?? []).map(({ menuItemName: name }) => name),
      ]
        .map(sanitize)
        .filter(Boolean);

      const suffix = choices.length ? `(${choices.join('/')})` : '';

      return `${sanitize(menuItemName)}${suffix} x${orderQuantity}`;
    })
    .join('#');

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

  constructor(private readonly configService: ConfigService) {
    this.merchantId = configService.getOrThrow('ECPAY_BASE_MERCHANT_ID');
    this.hashKey = configService.getOrThrow('ECPAY_BASE_HASH_KEY');
    this.hashIV = configService.getOrThrow('ECPAY_BASE_HASH_IV');

    this.apiUrl = getEcpayBaseApiUrl(getEcpayMode(configService));

    this.returnUrl = configService.getOrThrow('ECPAY_BASE_RETURN_URL');
    this.resultUrl = new URL('./result', this.returnUrl).toString();
  }

  private getEcpayDateString(): string {
    const taipei = new Date(Date.now() + 8 * 60 * 60 * 1000);

    return taipei
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')
      .replace(/-/g, '/');
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
    order: OrderResponseDto & { confirmationNumber: string },
    base: Omit<CheckoutEcpayDto, 'orderId'>,
  ): CheckoutEcpayResponseDto {
    const choosePayment = ECPAY_CHOOSE_PAYMENT[order.paymentMethod];

    const raw = {
      ...base,
      ItemName: truncateItemName(buildItemName(order.items)),
      TradeDesc: truncate(sanitize(base.TradeDesc), TRADE_DESC_MAX_LENGTH),
      ChoosePayment: choosePayment,
      ...(choosePayment === 'DigitalPayment' && {
        ChooseSubPayment: order.paymentMethod,
      }),
      EncryptType: '1',
      MerchantID: this.merchantId,
      MerchantTradeDate: this.getEcpayDateString(),
      MerchantTradeNo: order.confirmationNumber,
      NeedExtraPaidInfo: 'Y',
      OrderResultURL: base.ClientBackURL
        ? `${this.resultUrl}?redirect=${encodeURIComponent(base.ClientBackURL)}`
        : this.resultUrl,
      PaymentType: 'aio',
      ...(order.customer.remark && {
        Remark: truncate(order.customer.remark, REMARK_MAX_LENGTH),
      }),
      ReturnURL: this.returnUrl,
      TotalAmount:
        Math.round(sumOrderItems(order.items)) -
        Math.round(Number(order.discount || 0)),
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
