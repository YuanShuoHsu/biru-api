import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  PIONEX_KLINE_INTERVALS,
  type PionexKlineInterval,
} from '../pionex/pionex.types';

const TRADE_SIDES = ['BUY', 'SELL'] as const;

export class QuantMarketDto {
  @ApiProperty({ example: 'BTC_USDT' }) symbol: string;
  @ApiProperty() baseCurrency: string;
  @ApiProperty() quoteCurrency: string;
  @ApiProperty({ description: '價格小數位數' }) pricePrecision: number;
  @ApiProperty({ description: '數量小數位數' }) sizePrecision: number;
  @ApiProperty({ description: '24 小時前的價格' }) open: number;
  @ApiProperty({ description: '最新價' }) close: number;
  @ApiProperty() high: number;
  @ApiProperty() low: number;
  @ApiProperty({ description: '24 小時成交量（基礎幣）' }) volume: number;
  @ApiProperty({ description: '24 小時成交額（計價幣）' }) quoteVolume: number;
}

export class QuantCandleDto {
  @ApiProperty({ description: '開盤時間（毫秒）' }) time: number;
  @ApiProperty() open: number;
  @ApiProperty() high: number;
  @ApiProperty() low: number;
  @ApiProperty() close: number;
  @ApiProperty() volume: number;
}

export class QuantTradeDto {
  @ApiProperty() id: string;
  @ApiProperty() price: number;
  @ApiProperty() size: number;
  @ApiProperty({ enum: TRADE_SIDES, enumName: 'QuantTradeSide' })
  side: (typeof TRADE_SIDES)[number];
  @ApiProperty({ description: '成交時間（毫秒）' }) time: number;
}

export class QuantCandleQueryDto {
  @ApiProperty({
    enum: PIONEX_KLINE_INTERVALS,
    enumName: 'QuantCandleInterval',
  })
  @IsIn(PIONEX_KLINE_INTERVALS)
  interval: PionexKlineInterval;

  @ApiPropertyOptional({ default: 500, maximum: 500, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 500;

  @ApiPropertyOptional({ description: '只取此時間（毫秒）之前的 K 線' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  endTime?: number;
}

export class WatchMarketDto {
  @IsString()
  symbol: string;

  @IsIn(PIONEX_KLINE_INTERVALS)
  interval: PionexKlineInterval;
}
