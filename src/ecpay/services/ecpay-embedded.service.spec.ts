import { of } from 'rxjs';

import { EcpayEmbeddedService } from './ecpay-embedded.service.js';

import { decodeUrlEncoded, decryptData, encryptData } from '../utils/ecpay.js';

import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';

// https://developers.ecpay.com.tw/22867/
const config: Record<string, string> = {
  ECPAY_BASE_HASH_IV: 'EkRm7iFT261dpevs',
  ECPAY_BASE_HASH_KEY: 'pwFHCqoQZGmho4w6',
  ECPAY_BASE_MERCHANT_ID: '3002607',
  ECPAY_BASE_RETURN_URL: 'https://api.example.com/api/ecpay/return',
  ECPAY_OPERATION_MODE: 'Test',
};

const encrypt = (value: unknown) =>
  encryptData(
    encodeURIComponent(JSON.stringify(value)),
    config.ECPAY_BASE_HASH_KEY,
    config.ECPAY_BASE_HASH_IV,
  );

const decrypt = (value: string) =>
  JSON.parse(
    decodeUrlEncoded(
      decryptData(value, config.ECPAY_BASE_HASH_KEY, config.ECPAY_BASE_HASH_IV),
    ),
  );

const post = vi.fn();
const service = new EcpayEmbeddedService(
  { getOrThrow: (key: string) => config[key] } as unknown as ConfigService,
  { post } as unknown as HttpService,
);

const respond = (data: unknown, transCode = 1, transMsg = '') =>
  post.mockReturnValueOnce(
    of({
      data: { Data: encrypt(data), TransCode: transCode, TransMsg: transMsg },
    }),
  );

const order = (paymentMethod: string) =>
  ({
    confirmationNumber: 'ORD20250101ABCD1234',
    discount: '10',
    items: [{ menuItemName: '拿鐵', orderQuantity: 2, unitPrice: '60' }],
    merchantTradeNo: 'PAY20250101ABCD1234',
    paymentMethod,
  }) as never;

const sentRequest = () => {
  const [url, body] = post.mock.calls[0];

  return { url, body, data: decrypt(body.Data) };
};

beforeEach(() => {
  post.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-01-01T04:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('EcpayEmbeddedService.getTokenbyTrade', () => {
  const token = {
    RtnCode: 1,
    RtnMsg: '成功',
    MerchantID: '3002607',
    Token: 'abc',
    TokenExpireDate: '2025/01/01 12:30:00',
  };

  it('組出只帶該付款方式的 Token 請求', async () => {
    respond(token);

    await expect(
      service.getTokenbyTrade(order('Credit'), '碧露訂單'),
    ).resolves.toEqual(token);

    const { url, body, data } = sentRequest();
    expect(url).toBe(
      'https://ecpg-stage.ecpay.com.tw/Merchant/GetTokenbyTrade',
    );
    expect(body).toMatchObject({
      MerchantID: '3002607',
      RqHeader: { Timestamp: 1735704000 },
    });
    expect(data).toEqual({
      MerchantID: '3002607',
      RememberCard: 0,
      PaymentUIType: 2,
      ChoosePaymentList: '1',
      OrderInfo: {
        MerchantTradeDate: '2025/01/01 12:00:00',
        MerchantTradeNo: 'PAY20250101ABCD1234',
        ReturnURL: 'https://api.example.com/api/ecpay/embedded/return',
        ItemName: '拿鐵 x2',
        TotalAmount: 110,
        TradeDesc: '碧露訂單',
      },
      CardInfo: {
        OrderResultURL: 'https://api.example.com/api/ecpay/embedded/result',
      },
      CustomField: 'ORD20250101ABCD1234',
    });
  });

  it.each([
    ['ApplePay', '7', {}],
    [
      'TWQR',
      '11',
      {
        EPaymentInfo: {
          OrderResultURL: 'https://api.example.com/api/ecpay/embedded/result',
        },
      },
    ],
  ])('%s 帶 ChoosePaymentList %s', async (method, list, extra) => {
    respond(token);

    await service.getTokenbyTrade(order(method), '碧露訂單');

    const { data } = sentRequest();
    expect(data.ChoosePaymentList).toBe(list);
    expect(data.CardInfo).toBeUndefined();
    expect(data).toMatchObject(extra);
  });

  it.each(['Cash', 'Jkopay', 'iPASS', 'WeiXin'])(
    '%s 不走站內付',
    async (method) => {
      await expect(
        service.getTokenbyTrade(order(method), '碧露訂單'),
      ).rejects.toThrow();
      expect(post).not.toHaveBeenCalled();
    },
  );

  it('TransCode 非 1 時拋出 TransMsg', async () => {
    respond({}, 999, 'Fail');

    await expect(
      service.getTokenbyTrade(order('Credit'), '碧露訂單'),
    ).rejects.toMatchObject({ name: 'EcpayRejectedError', message: 'Fail' });
  });

  it('RtnCode 非 1 時拋出 RtnMsg', async () => {
    respond({ RtnCode: 10100050, RtnMsg: '參數錯誤' });

    await expect(
      service.getTokenbyTrade(order('Credit'), '碧露訂單'),
    ).rejects.toMatchObject({
      name: 'EcpayRejectedError',
      message: '參數錯誤',
    });
  });
});

describe('EcpayEmbeddedService.createPayment', () => {
  it('以 PayToken 與同一個 MerchantTradeNo 建立交易並回傳 ThreeDURL', async () => {
    respond({
      RtnCode: 1,
      RtnMsg: '成功',
      OrderInfo: { MerchantTradeNo: 'PAY20250101ABCD1234' },
      ThreeDInfo: { ThreeDURL: 'https://ecpg-stage.ecpay.com.tw/3d' },
    });

    const result = await service.createPayment(
      'pay-token',
      'PAY20250101ABCD1234',
    );

    expect(result.ThreeDInfo?.ThreeDURL).toBe(
      'https://ecpg-stage.ecpay.com.tw/3d',
    );
    const { url, data } = sentRequest();
    expect(url).toBe('https://ecpg-stage.ecpay.com.tw/Merchant/CreatePayment');
    expect(data).toEqual({
      MerchantID: '3002607',
      PayToken: 'pay-token',
      MerchantTradeNo: 'PAY20250101ABCD1234',
    });
  });

  it('RtnCode 非 1 時拋出 RtnMsg', async () => {
    respond({ RtnCode: 0, RtnMsg: 'Token 已過期' });

    await expect(
      service.createPayment('pay-token', 'PAY20250101ABCD1234'),
    ).rejects.toMatchObject({ message: 'Token 已過期' });
  });
});
