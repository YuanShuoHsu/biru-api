import type { PaymentMethod } from '../db/schema/orders.js';

type AioChoosePayment =
  'ApplePay' | 'Credit' | 'DigitalPayment' | 'TWQR' | 'WeiXin';

// https://developers.ecpay.com.tw/9040/
type EmbeddedChoosePaymentList = '1' | '7' | '11';

type EcpayPaymentRoute =
  | { integration: 'aio'; choosePayment: AioChoosePayment }
  | {
      integration: 'embedded';
      choosePayment: AioChoosePayment;
      choosePaymentList: EmbeddedChoosePaymentList;
    };

export const ECPAY_PAYMENT_ROUTES = {
  ApplePay: {
    integration: 'embedded',
    choosePayment: 'ApplePay',
    choosePaymentList: '7',
  },
  Cash: null,
  Credit: {
    integration: 'embedded',
    choosePayment: 'Credit',
    choosePaymentList: '1',
  },
  iPASS: { integration: 'aio', choosePayment: 'DigitalPayment' },
  Jkopay: { integration: 'aio', choosePayment: 'DigitalPayment' },
  TWQR: {
    integration: 'embedded',
    choosePayment: 'TWQR',
    choosePaymentList: '11',
  },
  WeiXin: { integration: 'aio', choosePayment: 'WeiXin' },
} as const satisfies Record<PaymentMethod, EcpayPaymentRoute | null>;

export type EmbeddedPaymentMethod = {
  [K in PaymentMethod]: (typeof ECPAY_PAYMENT_ROUTES)[K] extends {
    integration: 'embedded';
  }
    ? K
    : never;
}[PaymentMethod];

export const isEmbeddedPaymentMethod = (
  paymentMethod: PaymentMethod,
): paymentMethod is EmbeddedPaymentMethod =>
  ECPAY_PAYMENT_ROUTES[paymentMethod]?.integration === 'embedded';
