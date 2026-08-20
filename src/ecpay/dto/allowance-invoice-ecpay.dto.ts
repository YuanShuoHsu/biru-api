// https://developers.ecpay.com.tw/7901.md

export interface AllowanceInvoiceEcpayItemDto {
  ItemAmount: number;
  ItemCount: number;
  ItemName: string;
  ItemPrice: number;
  ItemSeq: number;
  ItemWord: string;
}

export interface AllowanceInvoiceEcpayDecryptedRequestDto {
  AllowanceAmount: number;
  AllowanceNotify: 'A' | 'E' | 'N' | 'S';
  CustomerName?: string;
  InvoiceDate: string;
  InvoiceNo: string;
  Items: AllowanceInvoiceEcpayItemDto[];
  MerchantID: string;
  NotifyMail?: string;
  NotifyPhone?: string;
  Reason?: string;
}

export interface AllowanceInvoiceEcpayEncryptedResponseDto {
  Data: string;
  TransCode: number;
  TransMsg: string;
}

export interface AllowanceInvoiceEcpayDecryptedResponseDto {
  IA_Date: string;
  IA_Allow_No: string;
  IA_Invoice_No: string;
  IA_Remain_Allowance_Amt: number;
  RtnCode: number;
  RtnMsg: string;
}
