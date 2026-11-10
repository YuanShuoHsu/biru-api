import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class UpdateInvoiceWordStatusEcpayEncryptedResponseRpHeaderDto {
  @ApiProperty({
    description: `回傳時間  
Unix timestamp(GMT+8)`,
    example: 1525169058,
  })
  @IsDefined()
  @IsNumber()
  Timestamp: number;
}

export class UpdateInvoiceWordStatusEcpayEncryptedResponseDto {
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
    type: () => UpdateInvoiceWordStatusEcpayEncryptedResponseRpHeaderDto,
  })
  @IsDefined()
  @Type(() => UpdateInvoiceWordStatusEcpayEncryptedResponseRpHeaderDto)
  @ValidateNested()
  RpHeader: UpdateInvoiceWordStatusEcpayEncryptedResponseRpHeaderDto;

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

export class UpdateInvoiceWordStatusEcpayDecryptedResponseDto {
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
    example: '成功',
    maxLength: 200,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 200)
  RtnMsg: string;
}
