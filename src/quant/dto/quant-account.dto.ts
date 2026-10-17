import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import {
  PIONEX_ORDER_SIDES,
  PIONEX_ORDER_TYPES,
  type PionexOrderSide,
  type PionexOrderType,
} from '../pionex/pionex.types';

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

export class WatchAccountDto {
  @IsString()
  credentialId: string;

  @IsString()
  symbol: string;
}
