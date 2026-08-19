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
}

export interface AllowanceInvoiceEcpayEncryptedResponseDto {
  Data: string;
  TransCode: number;
  TransMsg: string;
}

export interface AllowanceInvoiceEcpayDecryptedResponseDto {
  /** 折讓時間，yyyy-MM-dd HH:mm:ss */
  IA_Date: string;
  /** 折讓單號 */
  IA_Allow_No: string;
  IA_Invoice_No: string;
  /** 剩餘可折讓金額；下次折讓的上限以此為準 */
  IA_Remain_Allowance_Amt: number;
  RtnCode: number;
  RtnMsg: string;
}
