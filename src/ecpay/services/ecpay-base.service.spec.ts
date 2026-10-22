import type { ConfigService } from '@nestjs/config';

import { EcpayBaseService } from './ecpay-base.service.js';

// 綠界官方 AIO 測試帳號與測試向量
const config: Record<string, string> = {
  ECPAY_BASE_HASH_IV: 'EkRm7iFT261dpevs',
  ECPAY_BASE_HASH_KEY: 'pwFHCqoQZGmho4w6',
  ECPAY_BASE_MERCHANT_ID: '3002607',
  ECPAY_BASE_RETURN_URL: 'https://api.example.com/api/ecpay/return',
  ECPAY_OPERATION_MODE: 'Test',
};

const service = new EcpayBaseService({
  getOrThrow: (key: string) => config[key],
} as unknown as ConfigService);

const callback = {
  MerchantID: '3002607',
  MerchantTradeNo: 'Test1234567890',
  PaymentDate: '2025/01/01 12:05:00',
  PaymentType: 'Credit_CreditCard',
  RtnCode: '1',
  RtnMsg: 'Succeeded',
  SimulatePaid: '0',
  TradeAmt: '100',
  TradeDate: '2025/01/01 12:00:00',
  TradeNo: '2301011234567890',
};
const CALLBACK_MAC =
  '2AB536D86AFF8E1086744D59175040A32538C96B1C28C4135B551BD728E913B8';

describe('EcpayBaseService.generateCheckMacValue', () => {
  it.each([
    [
      'AIO 基本參數',
      {
        ChoosePayment: 'ALL',
        EncryptType: '1',
        ItemName: '測試商品',
        MerchantID: '3002607',
        MerchantTradeDate: '2025/01/01 12:00:00',
        MerchantTradeNo: 'Test1234567890',
        PaymentType: 'aio',
        ReturnURL: 'https://example.com/notify',
        TotalAmount: '100',
        TradeDesc: '測試',
      },
      '291CBA324D31FB5A4BBBFDF2CFE5D32598524753AFD4959C3BF590C5B2F57FB2',
    ],
    [
      "含 ' 字元",
      { ItemName: "Tom's Shop", MerchantID: '3002607', TotalAmount: '100' },
      'CF0A3D4901D99459D8641516EC57210700E8A5C9AB26B1D021301E9CB93EF78D',
    ],
    [
      '含 ~ 字元',
      { ItemName: 'Test~Product', MerchantID: '3002607', TotalAmount: '200' },
      'CEEAE01D2F9A8E74D4AC0DCE7735B046D73F35A5EC99558A31A2EE03159DA1C9',
    ],
    [
      '空格編成 +',
      {
        ItemName: 'My Test Product',
        MerchantID: '3002607',
        TotalAmount: '300',
      },
      '7712A5E6EDC3B57086063C88568084C66CE882A21D40E74DE5ACA3B478C6F316',
    ],
    ['付款通知', callback, CALLBACK_MAC],
  ])('%s符合官方測試向量', (_, params, expected) => {
    expect(service.generateCheckMacValue(params)).toBe(expected);
  });
});

describe('EcpayBaseService.isCheckMacValueValid', () => {
  it('簽章正確的付款通知回 1|OK', () => {
    expect(
      service.isCheckMacValueValid({
        ...callback,
        CheckMacValue: CALLBACK_MAC,
      }),
    ).toBe('1|OK');
  });

  it.each([
    ['竄改金額', { ...callback, TradeAmt: '1', CheckMacValue: CALLBACK_MAC }],
    [
      '竄改付款結果',
      { ...callback, RtnCode: '0', CheckMacValue: CALLBACK_MAC },
    ],
    ['偷加欄位', { ...callback, Extra: 'x', CheckMacValue: CALLBACK_MAC }],
    ['沒帶簽章', callback],
    ['簽章長度不符', { ...callback, CheckMacValue: 'ABC' }],
  ])('%s回 0|FAIL', (_, body) => {
    expect(service.isCheckMacValueValid(body)).toBe('0|FAIL');
  });
});
