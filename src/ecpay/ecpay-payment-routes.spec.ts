import {
  ECPAY_PAYMENT_ROUTES,
  isEmbeddedPaymentMethod,
} from './ecpay-payment-routes.js';

import { paymentMethodEnum } from '../db/schema/orders.js';

describe('ECPAY_PAYMENT_ROUTES', () => {
  it.each(paymentMethodEnum.enumValues)('%s 有明確的串接類型', (method) => {
    expect(ECPAY_PAYMENT_ROUTES).toHaveProperty(method);
  });

  it.each([
    ['ApplePay', 'embedded', '7'],
    ['Credit', 'embedded', '1'],
    ['TWQR', 'embedded', '11'],
    ['iPASS', 'aio', undefined],
    ['Jkopay', 'aio', undefined],
    ['WeiXin', 'aio', undefined],
  ] as const)('%s 走 %s', (method, integration, choosePaymentList) => {
    expect(ECPAY_PAYMENT_ROUTES[method]).toMatchObject({ integration });
    expect(
      (ECPAY_PAYMENT_ROUTES[method] as { choosePaymentList?: string })
        .choosePaymentList,
    ).toBe(choosePaymentList);
    expect(isEmbeddedPaymentMethod(method)).toBe(integration === 'embedded');
  });

  it('現金不經綠界', () => {
    expect(ECPAY_PAYMENT_ROUTES.Cash).toBeNull();
    expect(isEmbeddedPaymentMethod('Cash')).toBe(false);
  });
});
