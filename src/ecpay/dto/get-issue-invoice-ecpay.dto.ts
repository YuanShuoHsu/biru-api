// https://developers.ecpay.com.tw/7923.md

export interface GetIssueInvoiceEcpayEncryptedResponseDto {
  Data: string;
  TransCode: number;
  TransMsg: string;
}

export interface GetIssueInvoiceEcpayItem {
  ItemAmount: number;
  ItemCount: number;
  ItemName: string;
  ItemPrice: number;
  ItemSeq: number;
  ItemTaxType: string;
  ItemWord: string;
}

export interface GetIssueInvoiceEcpayDecryptedResponseDto {
  IIS_Create_Date: string;
  IIS_Identifier: string;
  IIS_Invalid_Status: string;
  IIS_Issue_Status: string;
  IIS_Number: string;
  IIS_Random_Number: string;
  IIS_Relate_Number: string;
  IIS_Remain_Allowance_Amt: number;
  IIS_Sales_Amount: number;
  IIS_Tax_Amount: number;
  IIS_Upload_Status: string;
  InvoiceRemark?: string | null;
  Items?: GetIssueInvoiceEcpayItem[];
  // 綠界後台設定 QR 密碼種子後才會回傳
  PosBarCode?: string;
  QRCode_Left?: string;
  QRCode_Right?: string;
  RtnCode: number;
  RtnMsg: string;
}
