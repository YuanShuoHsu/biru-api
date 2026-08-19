// https://developers.ecpay.com.tw/2885.md

export const ECPAY_DO_ACTION = {
  Capture: 'C',
  Refund: 'R',
  Cancel: 'E',
  Abandon: 'N',
} as const;
export type EcpayDoAction =
  (typeof ECPAY_DO_ACTION)[keyof typeof ECPAY_DO_ACTION];

export interface DoActionEcpayResponseDto {
  MerchantID: string;
  MerchantTradeNo: string;
  RtnCode: string;
  RtnMsg: string;
  TradeNo: string;
}
