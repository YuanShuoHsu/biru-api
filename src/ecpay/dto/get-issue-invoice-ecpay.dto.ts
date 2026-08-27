// https://developers.ecpay.com.tw/7923.md

export interface GetIssueInvoiceEcpayEncryptedResponseDto {
  Data: string;
  TransCode: number;
  TransMsg: string;
}

export interface GetIssueInvoiceEcpayDecryptedResponseDto {
  IIS_Create_Date: string;
  IIS_Invalid_Status: string;
  IIS_Issue_Status: string;
  IIS_Number: string;
  IIS_Random_Number: string;
  IIS_Relate_Number: string;
  IIS_Remain_Allowance_Amt: number;
  IIS_Sales_Amount: number;
  IIS_Upload_Status: string;
  RtnCode: number;
  RtnMsg: string;
}
