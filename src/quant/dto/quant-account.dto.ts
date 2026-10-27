import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PickType,
} from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  PIONEX_ORDER_SIDES,
  PIONEX_ORDER_TYPES,
  PIONEX_TRANSFER_ACCOUNTS,
  PIONEX_TRANSFER_STATUSES,
  type PionexOrderSide,
  type PionexOrderType,
  type PionexTransferAccount,
  type PionexTransferStatus,
} from '../pionex/pionex.types.js';

const ORDER_STATUSES = ['OPEN', 'CLOSED'] as const;
const FILL_ROLES = ['MAKER', 'TAKER'] as const;

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class QuantCredentialDto {
  @ApiProperty() id: string;
  @ApiProperty() label: string;
  @ApiProperty({ description: 'API key 末 4 碼' }) apiKeyLast4: string;
  @ApiProperty() createdAt: Date;
}

export class CreateQuantCredentialDto {
  @ApiProperty({ maxLength: 50 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  label: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  apiSecret: string;
}

export class QuantBalanceDto {
  @ApiProperty() coin: string;
  @ApiProperty({ description: '可用' }) free: number;
  @ApiProperty({ description: '掛單凍結' }) frozen: number;
}

export class QuantOrderDto {
  @ApiProperty() orderId: string;
  @ApiProperty() symbol: string;
  @ApiProperty({ enum: PIONEX_ORDER_SIDES, enumName: 'QuantOrderSide' })
  side: PionexOrderSide;
  @ApiProperty({ enum: PIONEX_ORDER_TYPES, enumName: 'QuantOrderType' })
  type: PionexOrderType;
  @ApiPropertyOptional({ description: '限價單價格' }) price?: number;
  @ApiPropertyOptional({ description: '委託數量（基礎幣）' }) size?: number;
  @ApiPropertyOptional({ description: '市價買單金額（計價幣）' })
  amount?: number;
  @ApiProperty() filledSize: number;
  @ApiProperty() filledAmount: number;
  @ApiProperty() fee: number;
  @ApiProperty() feeCoin: string;
  @ApiProperty({ enum: ORDER_STATUSES, enumName: 'QuantOrderStatus' })
  status: (typeof ORDER_STATUSES)[number];
  @ApiProperty({ description: '建立時間（毫秒）' }) createTime: number;
  @ApiProperty({ description: '最後更新時間（毫秒）' }) updateTime: number;
}

export class QuantFillDto {
  @ApiProperty() id: string;
  @ApiProperty() orderId: string;
  @ApiProperty({ enum: PIONEX_ORDER_SIDES, enumName: 'QuantOrderSide' })
  side: PionexOrderSide;
  @ApiProperty({ enum: FILL_ROLES, enumName: 'QuantFillRole' })
  role: (typeof FILL_ROLES)[number];
  @ApiProperty() price: number;
  @ApiProperty() size: number;
  @ApiProperty() fee: number;
  @ApiProperty() feeCoin: string;
  @ApiProperty({ description: '成交時間（毫秒）' }) time: number;
}

export class QuantSymbolQueryDto {
  @ApiProperty({ example: 'BTC_USDT' })
  @IsString()
  @IsNotEmpty()
  symbol: string;
}

export class QuantHistoryRangeQueryDto {
  @ApiPropertyOptional({ default: 10, maximum: 100, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiPropertyOptional({ description: '起始時間（毫秒）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  startTime?: number;

  @ApiPropertyOptional({
    description:
      '只回傳此時間（含）以前的紀錄（毫秒）；換頁時帶上一頁的 nextEndTime',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  endTime?: number;
}

export class QuantHistoryQueryDto extends IntersectionType(
  QuantSymbolQueryDto,
  QuantHistoryRangeQueryDto,
) {}

export const NEXT_END_TIME_DESCRIPTION =
  '下一頁要帶的 endTime；null 表示沒有更早的紀錄';

export class QuantOrderPageDto {
  @ApiProperty({ type: [QuantOrderDto] }) data: QuantOrderDto[];
  @ApiProperty({
    description: NEXT_END_TIME_DESCRIPTION,
    nullable: true,
    type: Number,
  })
  nextEndTime: number | null;
}

export class QuantFillPageDto {
  @ApiProperty({ type: [QuantFillDto] }) data: QuantFillDto[];
  @ApiProperty({
    description: NEXT_END_TIME_DESCRIPTION,
    nullable: true,
    type: Number,
  })
  nextEndTime: number | null;
}

export class PlaceQuantOrderDto {
  @ApiProperty({ example: 'BTC_USDT' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ enum: PIONEX_ORDER_SIDES, enumName: 'QuantOrderSide' })
  @IsIn(PIONEX_ORDER_SIDES)
  side: PionexOrderSide;

  @ApiProperty({ enum: PIONEX_ORDER_TYPES, enumName: 'QuantOrderType' })
  @IsIn(PIONEX_ORDER_TYPES)
  type: PionexOrderType;

  @ApiPropertyOptional({ description: '限價單必填', example: '30000' })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  price?: string;

  @ApiPropertyOptional({
    description: '限價單與市價賣單必填（基礎幣）',
    example: '0.001',
  })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  size?: string;

  @ApiPropertyOptional({ description: '市價買單必填（計價幣）', example: '20' })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  amount?: string;
}

export class PlaceQuantOrderResponseDto {
  @ApiProperty() orderId: string;
}

const TRANSFER_ACCOUNT_DESCRIPTION = 'MAIN 現貨帳戶、TRADE 合約帳戶';

export class CreateQuantTransferDto {
  @ApiProperty({
    description: `轉出帳戶，轉入另一個；${TRANSFER_ACCOUNT_DESCRIPTION}`,
    enum: PIONEX_TRANSFER_ACCOUNTS,
    enumName: 'QuantTransferAccount',
  })
  @IsIn(PIONEX_TRANSFER_ACCOUNTS)
  fromAccount: PionexTransferAccount;

  @ApiProperty({ example: 'USDT' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ example: '100' })
  @Matches(DECIMAL_PATTERN)
  amount: string;
}

export class QuantTransferDto {
  @ApiProperty() transferId: string;
  @ApiProperty({
    description: TRANSFER_ACCOUNT_DESCRIPTION,
    enum: PIONEX_TRANSFER_ACCOUNTS,
    enumName: 'QuantTransferAccount',
  })
  fromAccount: PionexTransferAccount;
  @ApiProperty({
    description: TRANSFER_ACCOUNT_DESCRIPTION,
    enum: PIONEX_TRANSFER_ACCOUNTS,
    enumName: 'QuantTransferAccount',
  })
  toAccount: PionexTransferAccount;
  @ApiProperty() currency: string;
  @ApiProperty() amount: number;
  @ApiProperty({
    enum: PIONEX_TRANSFER_STATUSES,
    enumName: 'QuantTransferStatus',
  })
  status: PionexTransferStatus;
  @ApiProperty({ description: '劃轉時間（毫秒）' }) time: number;
}

export class QuantTransferQueryDto extends PickType(QuantHistoryRangeQueryDto, [
  'endTime',
  'limit',
]) {}

export class QuantTransferPageDto {
  @ApiProperty({ type: [QuantTransferDto] }) data: QuantTransferDto[];
  @ApiProperty({
    description: NEXT_END_TIME_DESCRIPTION,
    nullable: true,
    type: Number,
  })
  nextEndTime: number | null;
}

class QuantAssetCategoryDto {
  @ApiProperty({ description: 'Pionex 的分類代碼' }) type: string;
  @ApiProperty({ description: 'Pionex 依語系翻譯的分類名稱' }) title: string;
  @ApiProperty() totalInUsdt: number;
}

export class QuantAssetAccountDto {
  @ApiProperty({
    description: TRANSFER_ACCOUNT_DESCRIPTION,
    enum: PIONEX_TRANSFER_ACCOUNTS,
    enumName: 'QuantTransferAccount',
  })
  account: PionexTransferAccount;
  @ApiProperty() totalInUsdt: number;
  @ApiProperty({ type: [QuantAssetCategoryDto] })
  categories: QuantAssetCategoryDto[];
}

export class QuantAssetsDto {
  @ApiProperty({ description: '所有帳戶的 USDT 估值' }) totalInUsdt: number;
  @ApiProperty({ description: '所有帳戶的 BTC 估值' }) totalInBtc: number;
  @ApiProperty({ type: [QuantAssetAccountDto] })
  accounts: QuantAssetAccountDto[];
}

export class WatchAccountDto {
  @IsString()
  credentialId: string;

  @IsString()
  symbol: string;
}
