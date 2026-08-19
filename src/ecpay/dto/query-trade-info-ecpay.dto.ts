// https://developers.ecpay.com.tw/2890.md

export const ECPAY_TRADE_STATUS = {
  Unpaid: '0',
  Paid: '1',
  Failed: '10200095',
  NotFound: '10200047',
} as const;

export interface QueryTradeInfoEcpayResponseDto {
  CheckMacValue: string;
  MerchantID: string;
  MerchantTradeNo: string;
  PaymentDate: string;
  PaymentType: string;
  TradeAmt: string;
  TradeDate: string;
  TradeNo: string;
  TradeStatus: string;
  [key: string]: string;
}
