import {
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export enum InvoicePrintEcpayPrintStyle {
  SinglePage = 1,
  DoublePage = 2,
  ThermalPaper = 3,
  B2BA4 = 4,
  B2BA5 = 5,
}

export class InvoicePrintEcpayDecryptedRequestDto {
  @ApiProperty({
    description: '特店編號（必填）',
    example: '2000132',
    maxLength: 10,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 10)
  MerchantID: string;

  @ApiProperty({
    description: `發票號碼（必填）
2 碼字軌 + 8 碼數字`,
    example: 'AB12345678',
    maxLength: 10,
    minLength: 10,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(10, 10)
  InvoiceNo: string;

  @ApiProperty({
    description: `發票開立日期（必填）
格式為 yyyy-MM-dd 或 yyyy/MM/dd`,
    example: '2026-08-17',
    maxLength: 10,
    minLength: 10,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(10, 10)
  InvoiceDate: string;

  @ApiProperty({
    description: `列印格式
1：一般列印（單面）
2：一般列印（雙面）
3：熱感應紙列印
4：B2B A4
5：B2B A5`,
    enum: InvoicePrintEcpayPrintStyle,
    example: InvoicePrintEcpayPrintStyle.ThermalPaper,
  })
  @IsDefined()
  @IsInt()
  PrintStyle: InvoicePrintEcpayPrintStyle;
}

export class InvoicePrintEcpayEncryptedResponseDto {
  @ApiProperty({
    description: `回傳代碼
1 代表 API 傳輸資料接收成功，實際執行結果請參考 RtnCode。`,
    example: 1,
  })
  @IsDefined()
  @IsInt()
  TransCode: number;

  @ApiProperty({ description: '回傳訊息', example: '', maxLength: 200 })
  @IsDefined()
  @IsString()
  @Length(0, 200)
  TransMsg: string;

  @ApiProperty({ description: '加密資料', example: '加密資料' })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  Data: string;
}

export class InvoicePrintEcpayDecryptedResponseDto {
  @ApiProperty({
    description: '回應代碼，1 代表成功',
    example: 1,
  })
  @IsDefined()
  @IsInt()
  RtnCode: number;

  @ApiProperty({ description: '回應訊息', example: '成功', maxLength: 200 })
  @IsDefined()
  @IsString()
  @Length(0, 200)
  RtnMsg: string;

  @ApiProperty({
    description: `發票列印網址
從呼叫此 API 開始計算 1 小時內有效`,
    example: 'https://vendor-stage.ecpay.com.tw/Einvoice/...',
  })
  @IsDefined()
  @IsString()
  InvoiceHtml: string;
}
