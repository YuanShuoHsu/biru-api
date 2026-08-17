import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CheckBarcodeEcpayDto {
  @ApiProperty({
    description: `手機條碼（必填）
固定長度為 8 碼字元，第 1 碼為【/】，其餘 7 碼由 0-9、A-Z、+、-、. 組成`,
    example: '/AB12345',
    maxLength: 8,
    minLength: 8,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(8, 8)
  @Matches(/^\/[0-9A-Z+\-.]{7}$/)
  barCode: string;
}

export class CheckBarcodeEcpayResponseDto {
  @ApiProperty({
    description: '手機條碼是否存在於財政部系統',
    example: true,
  })
  @IsDefined()
  @IsBoolean()
  isExist: boolean;
}

export class CheckBarcodeEcpayDecryptedRequestDto {
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
    description: '手機條碼（必填）',
    example: '/AB12345',
    maxLength: 8,
    minLength: 8,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(8, 8)
  BarCode: string;
}

export class CheckBarcodeEcpayEncryptedResponseDto {
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

export class CheckBarcodeEcpayDecryptedResponseDto {
  @ApiProperty({
    description: `回應代碼
1 代表 API 執行成功，其餘代碼均為失敗。9000001 代表財政部系統維護中。`,
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
    description: `手機條碼是否存在
Y：存在
N：不存在`,
    enum: ['Y', 'N'],
    example: 'Y',
  })
  @IsDefined()
  @IsIn(['Y', 'N'])
  IsExist: 'N' | 'Y';
}
