// https://developers.ecpay.com.tw/2894.md

export interface QueryCreditDetailEcpayCloseDataDto {
  amount: string;
  datetime: string;
  sno: string;
  status: string;
}

export interface QueryCreditDetailEcpayValueDto {
  amount: string;
  authtime: string;
  close_data: QueryCreditDetailEcpayCloseDataDto[] | null;
  clsamt: string;
  status: string;
  TradeID: string;
}

export interface QueryCreditDetailEcpayResponseDto {
  RtnMsg: string;
  RtnValue: QueryCreditDetailEcpayValueDto | null;
}
