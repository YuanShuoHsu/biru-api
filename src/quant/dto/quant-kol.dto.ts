import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { FUTURES_GRID_TRENDS } from './quant-bot.dto';

export class QuantKolQueryDto {
  @ApiProperty({ description: 'KOL 的分享碼' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  shareCode: string;

  @ApiPropertyOptional({ example: 'BTC_USDT_PERP' })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({
    enum: FUTURES_GRID_TRENDS,
    enumName: 'QuantFuturesGridTrend',
  })
  @IsOptional()
  @IsIn(FUTURES_GRID_TRENDS)
  trend?: (typeof FUTURES_GRID_TRENDS)[number];

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class QuantKolOrderDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: 'Pionex 的機器人類型，例如 futures_grid' })
  type: string;
  @ApiProperty({ description: '對應行情的交易對，例如 BTC_USDT_PERP' })
  symbol: string;
  @ApiProperty() status: string;
  @ApiProperty({ description: '是否為 KOL 置頂的單' }) pinned: boolean;
  @ApiPropertyOptional({
    enum: FUTURES_GRID_TRENDS,
    enumName: 'QuantFuturesGridTrend',
  })
  trend?: (typeof FUTURES_GRID_TRENDS)[number];
  @ApiPropertyOptional() leverage?: number;
  @ApiPropertyOptional() top?: number;
  @ApiPropertyOptional() bottom?: number;
  @ApiPropertyOptional() row?: number;
  @ApiPropertyOptional({ description: 'KOL 未公開投入金額時不回傳' })
  investment?: number;
  @ApiPropertyOptional({ description: '網格年化（0.1 = 10%）' })
  gridApr?: number;
  @ApiPropertyOptional({ description: '總報酬率（0.1 = 10%）' })
  totalReturn?: number;
  @ApiPropertyOptional({ description: '建立時價格' }) initPrice?: number;
  @ApiPropertyOptional() currentPrice?: number;
  @ApiProperty({ description: '建立時間（毫秒）' }) createTime: number;
}

export class QuantKolDto {
  @ApiProperty() nickname: string;
  @ApiPropertyOptional() avatar?: string;
  @ApiProperty() total: number;
  @ApiProperty() hasMore: boolean;
  @ApiProperty({ type: [QuantKolOrderDto] }) orders: QuantKolOrderDto[];
  @ApiProperty({ type: [String], description: '可篩選的交易對' })
  symbols: string[];
}
