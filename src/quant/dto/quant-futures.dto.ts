import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  PIONEX_FUTURES_ORDER_TYPES,
  PIONEX_ISOLATED_MODES,
  PIONEX_MARGIN_MODES,
  PIONEX_ORDER_SIDES,
  PIONEX_POSITION_MODES,
  PIONEX_POSITION_SIDES,
  type PionexFuturesOrderType,
  type PionexIsolatedMode,
  type PionexMarginMode,
  type PionexOrderSide,
  type PionexPositionMode,
  type PionexPositionSide,
} from '../pionex/pionex.types';

const ORDER_STATUSES = ['OPEN', 'CLOSED'] as const;
const FILL_ROLES = ['MAKER', 'TAKER'] as const;
const FEE_TYPES = ['TRADING', 'LIQUIDATION'] as const;
const POSITION_DIRECTIONS = ['LONG', 'SHORT'] as const;
const MARGIN_DIRECTIONS = ['IN', 'OUT'] as const;
const ISOLATED_POSITION_MODES = PIONEX_ISOLATED_MODES.filter(
  (mode) => mode !== 'CROSS',
);

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

export class QuantFuturesBalanceDto {
  @ApiProperty() coin: string;
  @ApiProperty({ description: '總資產＝可用＋凍結' }) assets: number;
  @ApiProperty({ description: '可用保證金' }) available: number;
  @ApiProperty({ description: '可轉回現貨帳戶' }) transferable: number;
  @ApiProperty({ description: '未實現盈虧' }) unrealizedPnL: number;
  @ApiProperty({ description: '已占用的起始保證金' })
  totalInitialMargin: number;
}

export class QuantFuturesAccountDto {
  @ApiProperty({
    enum: PIONEX_POSITION_MODES,
    enumName: 'QuantPositionMode',
    description: 'BUYSELL 單向持倉、OPENCLOSE 雙向持倉，整個帳戶共用',
  })
  positionMode: PionexPositionMode;
  @ApiProperty({
    type: [QuantFuturesBalanceDto],
    description: '全倉保證金，不含零餘額',
  })
  balances: QuantFuturesBalanceDto[];
}

export class QuantFuturesSymbolSettingsDto {
  @ApiProperty() symbol: string;
  @ApiProperty() leverage: number;
  @ApiProperty({ enum: PIONEX_MARGIN_MODES, enumName: 'QuantMarginMode' })
  marginMode: PionexMarginMode;
}

export class QuantPositionDto {
  @ApiProperty() positionId: string;
  @ApiProperty() symbol: string;
  @ApiProperty({ enum: PIONEX_ISOLATED_MODES, enumName: 'QuantIsolatedMode' })
  isolatedMode: PionexIsolatedMode;
  @ApiProperty({
    enum: POSITION_DIRECTIONS,
    enumName: 'QuantPositionDirection',
  })
  positionSide: (typeof POSITION_DIRECTIONS)[number];
  @ApiProperty({ description: '持倉數量（基礎幣），空倉為負數' })
  size: number;
  @ApiProperty() avgPrice: number;
  @ApiProperty() markPrice: number;
  @ApiProperty() unrealizedPnL: number;
  @ApiProperty() initialMargin: number;
  @ApiProperty() maintMargin: number;
  @ApiProperty({ description: '預估強平價，0 代表不會被強平' })
  liquidationPrice: number;
  @ApiProperty() leverage: number;
  @ApiProperty({ description: '開倉時間（毫秒）' }) createTime: number;
}

export class QuantPositionHistoryDto {
  @ApiProperty() positionId: string;
  @ApiProperty() symbol: string;
  @ApiProperty({ enum: PIONEX_ISOLATED_MODES, enumName: 'QuantIsolatedMode' })
  isolatedMode: PionexIsolatedMode;
  @ApiProperty({
    enum: POSITION_DIRECTIONS,
    enumName: 'QuantPositionDirection',
  })
  positionSide: (typeof POSITION_DIRECTIONS)[number];
  @ApiProperty({ description: '最大持倉數量（基礎幣）' }) size: number;
  @ApiProperty({ description: '開倉均價' }) openPrice: number;
  @ApiProperty({ description: '平倉均價' }) closePrice: number;
  @ApiProperty({ description: '已實現盈虧＝成交差額＋結算金額' })
  realizedPnL: number;
  @ApiProperty({ description: '是否曾被強平' }) liquidated: boolean;
  @ApiProperty() leverage: number;
  @ApiProperty({ description: '開倉時間（毫秒）' }) createTime: number;
  @ApiProperty({ description: '平倉時間（毫秒）' }) closeTime: number;
}

export class QuantFuturesOrderDto {
  @ApiProperty() orderId: string;
  @ApiProperty() symbol: string;
  @ApiProperty({ enum: PIONEX_ORDER_SIDES, enumName: 'QuantOrderSide' })
  side: PionexOrderSide;
  @ApiProperty({
    enum: PIONEX_FUTURES_ORDER_TYPES,
    enumName: 'QuantFuturesOrderType',
  })
  type: PionexFuturesOrderType;
  @ApiProperty({ enum: PIONEX_POSITION_SIDES, enumName: 'QuantPositionSide' })
  positionSide: PionexPositionSide;
  @ApiPropertyOptional({ description: '市價單沒有價格' }) price?: number;
  @ApiProperty({ description: '委託數量（基礎幣）' }) size: number;
  @ApiProperty() filledSize: number;
  @ApiProperty({ description: '成交金額（計價幣）' }) filledAmount: number;
  @ApiProperty() reduceOnly: boolean;
  @ApiProperty({ enum: ORDER_STATUSES, enumName: 'QuantOrderStatus' })
  status: (typeof ORDER_STATUSES)[number];
  @ApiProperty({ description: '建立時間（毫秒）' }) createTime: number;
  @ApiProperty({ description: '最後更新時間（毫秒）' }) updateTime: number;
}

export class QuantFuturesFillDto {
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
  @ApiProperty({ enum: FEE_TYPES, enumName: 'QuantFeeType' })
  feeType: (typeof FEE_TYPES)[number];
  @ApiProperty({ description: '成交時間（毫秒）' }) time: number;
}

export class QuantFundingFeeDto {
  @ApiProperty() symbol: string;
  @ApiProperty({ description: '正數為收入、負數為支出' }) fee: number;
  @ApiProperty() coin: string;
  @ApiProperty() rate: number;
  @ApiProperty({ description: '結算時間（毫秒）' }) time: number;
}

export class QuantOptionalSymbolQueryDto {
  @ApiPropertyOptional({
    example: 'BTC_USDT_PERP',
    description: '不帶則回傳全部交易對',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  symbol?: string;
}

export class QuantFuturesSymbolQueryDto {
  @ApiProperty({ example: 'BTC_USDT_PERP' })
  @IsString()
  @IsNotEmpty()
  symbol: string;
}

export class SetLeverageDto {
  @ApiProperty({ example: 'BTC_USDT_PERP' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  leverage: number;
}

export class SetMarginModeDto {
  @ApiProperty({ example: 'BTC_USDT_PERP' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ enum: PIONEX_MARGIN_MODES, enumName: 'QuantMarginMode' })
  @IsIn(PIONEX_MARGIN_MODES)
  marginMode: PionexMarginMode;
}

export class SetPositionModeDto {
  @ApiProperty({ enum: PIONEX_POSITION_MODES, enumName: 'QuantPositionMode' })
  @IsIn(PIONEX_POSITION_MODES)
  positionMode: PionexPositionMode;
}

export class AdjustIsolatedMarginDto {
  @ApiProperty({ example: 'BTC_USDT_PERP' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({
    enum: ISOLATED_POSITION_MODES,
    enumName: 'QuantIsolatedPositionMode',
  })
  @IsIn(ISOLATED_POSITION_MODES)
  isolatedMode: Exclude<PionexIsolatedMode, 'CROSS'>;

  @ApiProperty({
    enum: MARGIN_DIRECTIONS,
    enumName: 'QuantMarginDirection',
    description: 'IN 追加、OUT 減少',
  })
  @IsIn(MARGIN_DIRECTIONS)
  direction: (typeof MARGIN_DIRECTIONS)[number];

  @ApiProperty({ example: '10' })
  @Matches(DECIMAL_PATTERN)
  amount: string;
}

export class PlaceFuturesOrderDto {
  @ApiProperty({ example: 'BTC_USDT_PERP' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ enum: PIONEX_ORDER_SIDES, enumName: 'QuantOrderSide' })
  @IsIn(PIONEX_ORDER_SIDES)
  side: PionexOrderSide;

  @ApiProperty({
    enum: PIONEX_FUTURES_ORDER_TYPES,
    enumName: 'QuantFuturesOrderType',
  })
  @IsIn(PIONEX_FUTURES_ORDER_TYPES)
  type: PionexFuturesOrderType;

  @ApiProperty({
    enum: PIONEX_POSITION_SIDES,
    enumName: 'QuantPositionSide',
    description: '雙向持倉填 LONG／SHORT，單向持倉填 BOTH',
  })
  @IsIn(PIONEX_POSITION_SIDES)
  positionSide: PionexPositionSide;

  @ApiProperty({ description: '委託數量（基礎幣）', example: '0.001' })
  @Matches(DECIMAL_PATTERN)
  size: string;

  @ApiPropertyOptional({ description: '市價單以外必填', example: '80000' })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  price?: string;

  @ApiPropertyOptional({ description: '只減倉，限單向持倉', default: false })
  @IsOptional()
  @IsBoolean()
  reduceOnly?: boolean;
}

export class QuantFuturesRiskDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: '槓桿上限，手動下單與合約機器人都不能超過；null 代表不限制',
  })
  maxLeverage: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      '合約機器人每日虧損上限合計（計價幣），超過就停止全部合約機器人；null 代表不限制',
  })
  maxDailyLoss: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      '建立合約機器人時，預估強平價與目前價格的最小距離（比例，0.1＝10%）；null 代表不限制',
  })
  minLiquidationDistance: number | null;
}

export class UpdateQuantFuturesRiskDto {
  @ApiProperty({ type: Number, nullable: true, minimum: 1 })
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  maxLeverage: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    exclusiveMinimum: true,
    minimum: 0,
  })
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @IsPositive()
  maxDailyLoss: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    exclusiveMinimum: true,
    minimum: 0,
    maximum: 1,
  })
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @IsPositive()
  @Max(1)
  minLiquidationDistance: number | null;
}
