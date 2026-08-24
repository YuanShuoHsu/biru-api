// https://developers.ecpay.com.tw/?p=2878

import {
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ECPAY_PENDING_RTN_CODES: ReadonlySet<string> = new Set([
  '10300066',
]);

export class ReturnEcpayDto {
  @ApiProperty({
    description: '特店編號',
    example: '3002607',
    maxLength: 10,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 10)
  MerchantID: string;

  @ApiProperty({
    description: `特店交易編號  
訂單產生時傳送給綠界的特店交易編號。`,
    example: 'D9RMXNrihUYM',
    maxLength: 20,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 20)
  MerchantTradeNo: string;

  @ApiPropertyOptional({
    description: '特店旗下店舖代號',
    example: '',
    maxLength: 20,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 20)
  StoreID?: string;

  @ApiProperty({
    description: `交易狀態
- 若回傳值為 1 時，為付款成功
- 其餘代碼皆為交易異常，請至廠商管理後台確認後再出貨。

常見交易狀態：
- 10300066：「交易付款結果待確認中，請勿出貨」，請至廠商管理後台確認已付款完成再出貨。
- 10100248：「拒絕交易，請客戶聯繫發卡行確認原因」
- 10100252：「額度不足，請客戶檢查卡片額度或餘額」
- 10100254：「交易失敗，請客戶聯繫發卡行確認交易限制」
- 10100251：「卡片過期，請客戶檢查卡片重新交易」
- 10100255：「報失卡，請客戶更換卡片重新交易」
- 10100256：「被盜用卡，請客戶更換卡片重新交易」`,
    example: 1,
  })
  @IsDefined()
  @IsInt()
  RtnCode: number;

  @ApiProperty({
    description: '交易訊息',
    example: '交易成功',
    maxLength: 200,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 200)
  RtnMsg: string;

  @ApiProperty({
    description: `綠界的交易編號  
請保存綠界的交易編號與特店交易編號 [MerchantTradeNo] 的關連。`,
    example: '2412311225437371',
    maxLength: 20,
    minLength: 1,
  })
  @IsDefined()
  @IsString()
  @Length(1, 20)
  TradeNo: string;

  @ApiProperty({ description: '交易金額', example: 402 })
  @IsDefined()
  @IsInt()
  TradeAmt: number;

  @ApiProperty({
    description: `付款時間  
格式為 yyyy/MM/dd HH:mm:ss`,
    example: '2024/12/31 12:26:09',
    maxLength: 20,
    minLength: 19,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(19, 20)
  @Matches(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/)
  PaymentDate: string;

  @ApiProperty({
    description: `特店選擇的付款方式  
請參考回覆付款方式一覽表`,
    example: 'Credit_CreditCard',
    maxLength: 20,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 20)
  PaymentType: string;

  @ApiProperty({
    description: `交易服務金額  
交易手續費+交易處理費的總金額`,
    example: 10,
  })
  @IsDefined()
  @IsNumber()
  PaymentTypeChargeFee: number;

  @ApiProperty({
    description: `訂單成立時間  
格式為 yyyy/MM/dd HH:mm:ss`,
    example: '2024/12/31 12:25:43',
    maxLength: 20,
    minLength: 19,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(19, 20)
  @Matches(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/)
  TradeDate: string;

  @ApiPropertyOptional({
    description: `特約合作平台商代號  
為專案合作的平台商使用。`,
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @Length(0, 10)
  PlatformID?: string;

  @ApiPropertyOptional({
    description: `是否為模擬付款
- 是否為模擬付款
- 0：代表此交易非模擬付款。
- 1：代表此交易為模擬付款，RtnCode 也為 1。並非是由消費者實際真的付款，所以綠界也不會撥款給廠商，請勿對該筆交易做出貨等動作，以避免損失。

注意事項：
1. 特店可透過廠商後台來針對單筆訂單模擬綠界回傳付款通知，以方便介接 API。
2. 此功能僅只是用於測試 ReturnURL 是否能成功接收，不會改變付款狀態。
3. 只有透過廠商後台的定期定額查詢功能發動的模擬付款通知，綠界才會傳送此參數，正常由定期定額排程所發送的付款通知，不會傳送此參數。`,
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  SimulatePaid?: number;

  @ApiPropertyOptional({
    description: `自訂名稱欄位 1  
提供合作廠商使用記錄用客製化使用欄位`,
    example: '',
    maxLength: 50,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 50)
  CustomField1?: string;

  @ApiPropertyOptional({
    description: `自訂名稱欄位 2  
提供合作廠商使用記錄用客製化使用欄位`,
    example: '',
    maxLength: 50,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 50)
  CustomField2?: string;

  @ApiPropertyOptional({
    description: `自訂名稱欄位 3  
提供合作廠商使用記錄用客製化使用欄位`,
    example: '',
    maxLength: 50,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 50)
  CustomField3?: string;

  @ApiPropertyOptional({
    description: `自訂名稱欄位 4  
提供合作廠商使用記錄用客製化使用欄位`,
    example: '',
    maxLength: 50,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 50)
  CustomField4?: string;

  @ApiProperty({
    description: `檢查碼  
特店必須檢查檢查碼 [CheckMacValue] 來驗證，請參考附錄檢查碼機制。`,
    example: '85D927637935683EA756CDEF76498FEB9F5D098A7A1AC4F0CB3B3609A9D4116A',
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  CheckMacValue: string;
}
