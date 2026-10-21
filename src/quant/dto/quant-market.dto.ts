import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  PIONEX_KLINE_INTERVALS,
  PIONEX_MARKET_TYPES,
  PIONEX_ORDER_SIDES,
  type PionexKlineInterval,
  type PionexMarketType,
  type PionexOrderSide,
} from '../pionex/pionex.types.js';

export class QuantPerpSpecDto {
  @ApiProperty({ description: '最高槓桿（第一級風險限額）' })
  maxLeverage: number;
  @ApiProperty({ description: '市價單最小數量（基礎幣）' })
  minMarketSize: number;
  @ApiProperty({ description: '市價單最大數量（基礎幣）' })
  maxMarketSize: number;
  @ApiProperty({ description: '強平手續費率' }) liquidationFeeRate: number;
}

export class QuantMarketDto {
  @ApiProperty({ example: 'BTC_USDT' }) symbol: string;
  @ApiProperty({ enum: PIONEX_MARKET_TYPES, enumName: 'QuantMarketType' })
  type: PionexMarketType;
  @ApiProperty() baseCurrency: string;
  @ApiProperty() quoteCurrency: string;
  @ApiProperty({ description: '價格小數位數' }) pricePrecision: number;
  @ApiProperty({ description: '數量小數位數' }) sizePrecision: number;
  @ApiProperty({ description: '市價買單金額小數位數' }) amountPrecision: number;
  @ApiProperty({ description: '最小下單金額（計價幣）' }) minAmount: number;
  @ApiProperty({ description: '最小下單數量（基礎幣）' }) minTradeSize: number;
  @ApiProperty({ description: '最大下單數量（基礎幣）' }) maxTradeSize: number;
  @ApiProperty({ description: '24 小時前的價格' }) open: number;
  @ApiProperty({ description: '最新價' }) close: number;
  @ApiProperty() high: number;
  @ApiProperty() low: number;
  @ApiProperty({ description: '24 小時成交量（基礎幣）' }) volume: number;
  @ApiProperty({ description: '24 小時成交額（計價幣）' }) quoteVolume: number;
  @ApiPropertyOptional({ type: QuantPerpSpecDto, description: '只有合約有' })
  perp?: QuantPerpSpecDto;
}

export class QuantMarketsQueryDto {
  @ApiPropertyOptional({
    default: 'SPOT',
    enum: PIONEX_MARKET_TYPES,
    enumName: 'QuantMarketType',
  })
  @IsOptional()
  @IsIn(PIONEX_MARKET_TYPES)
  type: PionexMarketType = 'SPOT';
}

export class QuantRiskTierDto {
  @ApiProperty({ description: '此級距的名目價值上限（計價幣）' })
  notionalLimit: number;
  @ApiProperty() maxLeverage: number;
  @ApiProperty({ description: '維持保證金率' }) maintMarginRatio: number;
  @ApiProperty({ description: '維持保證金速算扣除額' }) quickDeduction: number;
}

export class QuantPerpInfoDto {
  @ApiProperty() indexPrice: number;
  @ApiProperty({ description: '標記價格，強平依此計算' }) markPrice: number;
  @ApiProperty({ description: '預估下次資金費率' }) nextFundingRate: number;
  @ApiProperty({ description: '下次資金費結算時間（毫秒）' })
  nextFundingTime: number;
  @ApiProperty({ description: '未平倉量（基礎幣）' }) openInterest: number;
  @ApiProperty({ type: [QuantRiskTierDto] }) riskTiers: QuantRiskTierDto[];
}

export class QuantFundingRateDto {
  @ApiProperty() rate: number;
  @ApiProperty({ description: '結算時間（毫秒）' }) time: number;
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
  @ApiProperty({ enum: PIONEX_ORDER_SIDES, enumName: 'QuantOrderSide' })
  side: PionexOrderSide;
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

export class QuantFundingRateQueryDto {
  @ApiPropertyOptional({ default: 100, maximum: 500, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 100;

  @ApiPropertyOptional({ description: '只取此時間（毫秒）之前的資金費率' })
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
