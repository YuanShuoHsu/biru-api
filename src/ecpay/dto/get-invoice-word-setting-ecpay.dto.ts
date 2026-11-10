import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum GetInvoiceWordSettingEcpayInvoiceTerm {
  All = 0,
  JanFeb = 1,
  MarApr = 2,
  MayJun = 3,
  JulAug = 4,
  SepOct = 5,
  NovDec = 6,
}

export enum GetInvoiceWordSettingEcpayUseStatus {
  All = 0,
  NotEnabled = 1,
  InUse = 2,
  Disabled = 3,
  Suspended = 4,
  PendingReview = 5,
  Rejected = 6,
}

enum GetInvoiceWordSettingEcpayInvoiceCategory {
  B2C = 1,
}

enum GetInvoiceWordSettingEcpayInvType {
  GeneralTax = '07',
  SpecialTax = '08',
}

class GetInvoiceWordSettingEcpayResponseHeaderDto {
  @ApiProperty({
    description: `回傳時間  
Unix timestamp（GMT+8）`,
    example: 1525169058,
  })
  @IsDefined()
  @IsNumber()
  Timestamp: number;
}

export class GetInvoiceWordSettingEcpayEncryptedResponseDto {
  @ApiPropertyOptional({
    description: '特約合作平台商代號',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @Length(0, 10)
  PlatformID?: string;

  @ApiProperty({
    description: '特店編號',
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
    description: '回傳資料',
    type: () => GetInvoiceWordSettingEcpayResponseHeaderDto,
  })
  @IsDefined()
  @Type(() => GetInvoiceWordSettingEcpayResponseHeaderDto)
  @ValidateNested()
  RpHeader: GetInvoiceWordSettingEcpayResponseHeaderDto;

  @ApiProperty({
    description: `回傳代碼  
1 代表 API 傳輸資料（MerchantID, RqHeader, Data）接收成功，實際的 API 執行結果狀態請參考 RtnCode。`,
    example: 1,
  })
  @IsDefined()
  @IsInt()
  TransCode: number;

  @ApiProperty({
    description: '回傳訊息',
    example: '',
    maxLength: 200,
  })
  @IsDefined()
  @IsString()
  @Length(0, 200)
  TransMsg: string;

  @ApiProperty({
    description: `加密資料  
回傳相關資料，此為加密過 JSON 格式的資料。加密方法說明`,
    example: '加密資料',
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  Data: string;
}

export class GetInvoiceWordSettingEcpayInvoiceInfoDto {
  @ApiProperty({
    description: '字軌號碼 ID',
    example: '1234567890',
    maxLength: 10,
    minLength: 1,
  })
  @IsDefined()
  @IsNumberString()
  @Length(1, 10)
  TrackID: string;

  @ApiProperty({
    description: '發票年度',
    example: '109',
    maxLength: 3,
    minLength: 3,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsNumberString()
  @Length(3, 3)
  InvoiceYear: string;

  @ApiProperty({
    description: `發票期別  
1：1-2月  
2：3-4月  
3：5-6月  
4：7-8月  
5：9-10月  
6：11-12月`,
    enum: GetInvoiceWordSettingEcpayInvoiceTerm,
    example: GetInvoiceWordSettingEcpayInvoiceTerm.JanFeb,
    maximum: 6,
    minimum: 1,
  })
  @IsDefined()
  @IsInt()
  @Max(6)
  @Min(1)
  @IsEnum(GetInvoiceWordSettingEcpayInvoiceTerm)
  InvoiceTerm: GetInvoiceWordSettingEcpayInvoiceTerm;

  @ApiProperty({
    description: `發票類別  
1：B2C`,
    enum: GetInvoiceWordSettingEcpayInvoiceCategory,
    example: GetInvoiceWordSettingEcpayInvoiceCategory.B2C,
    maximum: 1,
    minimum: 1,
  })
  @IsDefined()
  @IsInt()
  @Max(1)
  @Min(1)
  @IsEnum(GetInvoiceWordSettingEcpayInvoiceCategory)
  InvoiceCategory: GetInvoiceWordSettingEcpayInvoiceCategory;

  @ApiProperty({
    description: `字軌類別  
07：一般稅額發票  
08：特種稅額發票`,
    enum: GetInvoiceWordSettingEcpayInvType,
    example: GetInvoiceWordSettingEcpayInvType.GeneralTax,
    maxLength: 2,
    minLength: 2,
  })
  @IsDefined()
  @IsNumberString()
  @Length(2, 2)
  @IsEnum(GetInvoiceWordSettingEcpayInvType)
  InvType: GetInvoiceWordSettingEcpayInvType;

  @ApiPropertyOptional({
    description: `產品服務別代號  
該參數由英文字母（A-Z, a-z）和數字（0-9）組成，其長度在 1 到 10 個字符之間。`,
    example: 'A001',
    maxLength: 10,
    minLength: 1,
  })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  @Matches(/^[A-Za-z0-9]{1,10}$/)
  ProductServiceId?: string;

  @ApiProperty({
    description: '字軌名稱',
    example: 'AQ',
    maxLength: 2,
    minLength: 2,
  })
  @IsDefined()
  @IsString()
  @Length(2, 2)
  InvoiceHeader: string;

  @ApiProperty({
    description: '起始發票編號',
    example: '10000000',
    maxLength: 8,
    minLength: 8,
  })
  @IsDefined()
  @IsNumberString()
  @Length(8, 8)
  @Matches(/^\d{6}(00|50)$/)
  InvoiceStart: string;

  @ApiProperty({
    description: '結束發票編號',
    example: '19999999',
    maxLength: 8,
    minLength: 8,
  })
  @IsDefined()
  @IsNumberString()
  @Length(8, 8)
  @Matches(/^\d{6}(49|99)$/)
  InvoiceEnd: string;

  @ApiProperty({
    description: '目前已使用號碼',
    example: '12345678',
    maxLength: 8,
    minLength: 8,
  })
  @IsDefined()
  @IsNumberString()
  @Length(8, 8)
  InvoiceNo: string;

  @ApiProperty({
    description: `使用狀態  
1：未啟用  
2：使用中  
3：已停用  
4：暫停中  
5：待審核  
6：審核不通過`,
    enum: GetInvoiceWordSettingEcpayUseStatus,
    example: GetInvoiceWordSettingEcpayUseStatus.InUse,
    maximum: 6,
    minimum: 1,
  })
  @IsDefined()
  @Max(6)
  @Min(1)
  @IsEnum(GetInvoiceWordSettingEcpayUseStatus)
  UseStatus: GetInvoiceWordSettingEcpayUseStatus;
}

export class GetInvoiceWordSettingEcpayDecryptedResponseDto {
  @ApiProperty({
    description: `回應代碼  
1 代表 API 執行成功，其餘代碼均為失敗。`,
    example: 1,
  })
  @IsDefined()
  @IsInt()
  RtnCode: number;

  @ApiProperty({
    description: '回應訊息',
    example: '查詢成功',
    maxLength: 200,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 200)
  RtnMsg: string;

  @ApiProperty({
    description: '發票資訊',
    type: () => [GetInvoiceWordSettingEcpayInvoiceInfoDto],
  })
  @IsDefined()
  @IsArray()
  @Type(() => GetInvoiceWordSettingEcpayInvoiceInfoDto)
  @ValidateNested({ each: true })
  InvoiceInfo: GetInvoiceWordSettingEcpayInvoiceInfoDto[];
}
