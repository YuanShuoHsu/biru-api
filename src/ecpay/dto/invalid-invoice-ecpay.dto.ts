// https://developers.ecpay.com.tw/7906.md

export interface InvalidInvoiceEcpayDecryptedRequestDto {
  InvoiceDate: string;
  InvoiceNo: string;
  MerchantID: string;
  Reason: string;
}

export interface InvalidInvoiceEcpayEncryptedResponseDto {
  Data: string;
  TransCode: number;
  TransMsg: string;
}

export interface InvalidInvoiceEcpayDecryptedResponseDto {
  InvoiceNo: string;
  RtnCode: number;
  RtnMsg: string;
}
