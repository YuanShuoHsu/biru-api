import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  PIONEX_KLINE_INTERVALS,
  type PionexKlineInterval,
} from '../pionex/pionex.types';

export const QUANT_BOT_TYPES = ['grid', 'dca', 'indicator', 'webhook'] as const;
export const QUANT_BOT_MODES = ['paper', 'live'] as const;
export const QUANT_BOT_STATUSES = ['running', 'stopped', 'error'] as const;
export const GRID_TYPES = ['arithmetic', 'geometric'] as const;
export const GRID_STOP_TYPES = ['price', 'profit_amount'] as const;
export const GRID_CLOSE_MODELS = ['NOT_SELL', 'TO_QUOTE'] as const;
export const TRIGGER_DIRECTIONS = ['above', 'below'] as const;
export const INDICATOR_KINDS = [
  'rsi',
  'maCross',
  'emaCross',
  'macdCross',
  'bollinger',
] as const;
export const CONDITION_OPERATORS = ['above', 'below'] as const;
export const CROSS_DIRECTIONS = ['golden', 'death'] as const;
export const BOLLINGER_BANDS = ['upper', 'lower'] as const;
export const WEBHOOK_ACTIONS = ['buy', 'sell', 'close'] as const;

export type QuantBotType = (typeof QUANT_BOT_TYPES)[number];
export type QuantBotMode = (typeof QUANT_BOT_MODES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class GridStopDto {
  @ApiProperty({ enum: GRID_STOP_TYPES, enumName: 'QuantGridStopType' })
  @IsIn(GRID_STOP_TYPES)
  type: (typeof GRID_STOP_TYPES)[number];

  @ApiProperty({ description: 'price：觸發價；profit_amount：金額（計價幣）' })
  @IsNumber()
  @IsPositive()
  value: number;
}

export class TriggerDto {
  @ApiProperty() @IsNumber() @IsPositive() price: number;

  @ApiProperty({
    enum: TRIGGER_DIRECTIONS,
    enumName: 'QuantTriggerDirection',
  })
  @IsIn(TRIGGER_DIRECTIONS)
  direction: (typeof TRIGGER_DIRECTIONS)[number];
}

// https://www.pionex.com/docs/api-docs/bot-api/spot-grid
export class GridConfigDto {
  @ApiProperty({ description: '上界' }) @IsNumber() @IsPositive() top: number;
  @ApiProperty({ description: '下界' })
  @IsNumber()
  @IsPositive()
  bottom: number;

  @ApiProperty({ description: '格數', minimum: 2, maximum: 200 })
  @IsInt()
  @Min(2)
  @Max(200)
  row: number;

  @ApiProperty({ enum: GRID_TYPES, enumName: 'QuantGridType' })
  @IsIn(GRID_TYPES)
  gridType: (typeof GRID_TYPES)[number];

  @ApiPropertyOptional({ type: GridStopDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GridStopDto)
  lossStop?: GridStopDto;

  @ApiPropertyOptional({ type: GridStopDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GridStopDto)
  profitStop?: GridStopDto;

  @ApiPropertyOptional({ type: TriggerDto, description: '價格觸及才開始' })
  @IsOptional()
  @ValidateNested()
  @Type(() => TriggerDto)
  trigger?: TriggerDto;

  @ApiProperty({
    enum: GRID_CLOSE_MODELS,
    enumName: 'QuantGridCloseModel',
    description: '停止時是否把持有的基礎幣賣回計價幣',
  })
  @IsIn(GRID_CLOSE_MODELS)
  closeModel: (typeof GRID_CLOSE_MODELS)[number];
}

export class DcaConfigDto {
  @ApiProperty({ description: '首單金額（計價幣）' })
  @IsNumber()
  @IsPositive()
  baseOrderAmount: number;

  @ApiProperty({ description: '首筆加碼金額（計價幣）' })
  @IsNumber()
  @IsPositive()
  safetyOrderAmount: number;

  @ApiProperty({ description: '最多加碼次數', minimum: 0, maximum: 50 })
  @IsInt()
  @Min(0)
  @Max(50)
  maxSafetyOrders: number;

  @ApiProperty({ description: '首筆加碼的跌幅（%）' })
  @IsNumber()
  @IsPositive()
  @Max(100)
  priceDeviation: number;

  @ApiProperty({ description: '加碼間距倍率（每次跌幅乘以此倍率）' })
  @IsNumber()
  @Min(1)
  @Max(10)
  stepScale: number;

  @ApiProperty({ description: '加碼金額倍率（每次金額乘以此倍率）' })
  @IsNumber()
  @Min(1)
  @Max(10)
  volumeScale: number;

  @ApiProperty({ description: '停利（%，相對均價）' })
  @IsNumber()
  @IsPositive()
  @Max(1000)
  takeProfit: number;

  @ApiPropertyOptional({ description: '停損（%，相對均價）' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(100)
  stopLoss?: number;
}

export class IndicatorConditionDto {
  @ApiProperty({ enum: INDICATOR_KINDS, enumName: 'QuantIndicatorKind' })
  @IsIn(INDICATOR_KINDS)
  kind: (typeof INDICATOR_KINDS)[number];

  @ApiPropertyOptional({ description: 'RSI／布林通道週期' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(500)
  period?: number;

  @ApiPropertyOptional({ description: '均線交叉的快線週期' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  fast?: number;

  @ApiPropertyOptional({ description: '均線交叉的慢線週期' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(500)
  slow?: number;

  @ApiPropertyOptional({
    enum: CONDITION_OPERATORS,
    enumName: 'QuantConditionOperator',
    description: 'RSI 高於／低於門檻；布林通道為收盤價突破上軌／跌破下軌',
  })
  @IsOptional()
  @IsIn(CONDITION_OPERATORS)
  operator?: (typeof CONDITION_OPERATORS)[number];

  @ApiPropertyOptional({ description: 'RSI 門檻' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  value?: number;

  @ApiPropertyOptional({
    enum: CROSS_DIRECTIONS,
    enumName: 'QuantCrossDirection',
  })
  @IsOptional()
  @IsIn(CROSS_DIRECTIONS)
  direction?: (typeof CROSS_DIRECTIONS)[number];

  @ApiPropertyOptional({ description: '布林通道標準差倍數' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(10)
  stdDev?: number;

  @ApiPropertyOptional({
    enum: BOLLINGER_BANDS,
    enumName: 'QuantBollingerBand',
  })
  @IsOptional()
  @IsIn(BOLLINGER_BANDS)
  band?: (typeof BOLLINGER_BANDS)[number];
}

export class IndicatorConfigDto {
  @ApiProperty({
    enum: PIONEX_KLINE_INTERVALS,
    enumName: 'QuantCandleInterval',
  })
  @IsIn(PIONEX_KLINE_INTERVALS)
  interval: PionexKlineInterval;

  @ApiProperty({ type: [IndicatorConditionDto], description: '全部成立才進場' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => IndicatorConditionDto)
  entry: IndicatorConditionDto[];

  @ApiProperty({
    type: [IndicatorConditionDto],
    description: '任一成立就出場',
  })
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => IndicatorConditionDto)
  exit: IndicatorConditionDto[];

  @ApiProperty({ description: '每次進場金額（計價幣）' })
  @IsNumber()
  @IsPositive()
  orderAmount: number;

  @ApiPropertyOptional({ description: '停利（%，相對進場均價）' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(1000)
  takeProfit?: number;

  @ApiPropertyOptional({ description: '停損（%，相對進場均價）' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(100)
  stopLoss?: number;
}

export class WebhookConfigDto {
  @ApiProperty({ description: '訊號未指定金額時的每次買入金額（計價幣）' })
  @IsNumber()
  @IsPositive()
  orderAmount: number;
}

class CreateQuantBotBaseDto {
  @ApiProperty({ maxLength: 50 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 'BTC_USDT' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ enum: QUANT_BOT_MODES, enumName: 'QuantBotMode' })
  @IsIn(QUANT_BOT_MODES)
  mode: QuantBotMode;

  @ApiPropertyOptional({ description: '實盤必填' })
  @IsOptional()
  @IsString()
  credentialId?: string;

  @ApiProperty({
    description: '投入金額（計價幣），也是機器人可動用資金的上限',
  })
  @IsNumber()
  @IsPositive()
  investment: number;

  @ApiPropertyOptional({ description: '模擬盤必填：手續費率（例如 0.0005）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.01)
  paperFeeRate?: number;

  @ApiPropertyOptional({ description: '每日最大虧損（計價幣），觸發即停止' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxDailyLoss?: number;
}

export class CreateGridBotDto extends CreateQuantBotBaseDto {
  @ApiProperty({ type: GridConfigDto })
  @ValidateNested()
  @Type(() => GridConfigDto)
  config: GridConfigDto;
}

export class CreateDcaBotDto extends CreateQuantBotBaseDto {
  @ApiProperty({ type: DcaConfigDto })
  @ValidateNested()
  @Type(() => DcaConfigDto)
  config: DcaConfigDto;
}

export class CreateIndicatorBotDto extends CreateQuantBotBaseDto {
  @ApiProperty({ type: IndicatorConfigDto })
  @ValidateNested()
  @Type(() => IndicatorConfigDto)
  config: IndicatorConfigDto;
}

export class CreateWebhookBotDto extends CreateQuantBotBaseDto {
  @ApiProperty({ type: WebhookConfigDto })
  @ValidateNested()
  @Type(() => WebhookConfigDto)
  config: WebhookConfigDto;
}

export type CreateQuantBotDto =
  | CreateGridBotDto
  | CreateDcaBotDto
  | CreateIndicatorBotDto
  | CreateWebhookBotDto;

export class QuantBotSummaryDto {
  @ApiProperty({ description: '目前權益（計價幣）' }) equity: number;
  @ApiProperty({ description: '總損益（計價幣）' }) pnl: number;
  @ApiProperty({ description: '已實現損益（計價幣）' }) realizedPnl: number;
  @ApiProperty({ description: '持有基礎幣數量' }) position: number;
  @ApiProperty({ description: '持倉均價' }) averageCost: number;
  @ApiProperty({ description: '成交筆數' }) fillCount: number;
}

@ApiExtraModels(
  GridConfigDto,
  DcaConfigDto,
  IndicatorConfigDto,
  WebhookConfigDto,
)
export class QuantBotDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: QUANT_BOT_TYPES, enumName: 'QuantBotType' })
  type: QuantBotType;
  @ApiProperty({ enum: QUANT_BOT_MODES, enumName: 'QuantBotMode' })
  mode: QuantBotMode;
  @ApiProperty() symbol: string;
  @ApiProperty({ enum: QUANT_BOT_STATUSES, enumName: 'QuantBotStatus' })
  status: (typeof QUANT_BOT_STATUSES)[number];
  @ApiPropertyOptional({ description: '停止或錯誤的原因' })
  statusReason?: string;
  @ApiPropertyOptional() credentialId?: string;
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(GridConfigDto) },
      { $ref: getSchemaPath(DcaConfigDto) },
      { $ref: getSchemaPath(IndicatorConfigDto) },
      { $ref: getSchemaPath(WebhookConfigDto) },
    ],
  })
  config: GridConfigDto | DcaConfigDto | IndicatorConfigDto | WebhookConfigDto;
  @ApiProperty() investment: number;
  @ApiPropertyOptional() paperFeeRate?: number;
  @ApiPropertyOptional() maxDailyLoss?: number;
  @ApiPropertyOptional({ description: 'Pionex 內建機器人 id' })
  pionexBotId?: string;
  @ApiProperty({ type: QuantBotSummaryDto }) summary: QuantBotSummaryDto;
  @ApiPropertyOptional() startedAt?: Date;
  @ApiPropertyOptional() stoppedAt?: Date;
  @ApiProperty() createdAt: Date;
}

export class CreateQuantBotResponseDto extends QuantBotDto {
  @ApiPropertyOptional({
    description: 'Webhook 機器人的 token，只在建立時回傳這一次',
  })
  webhookToken?: string;
}

export class QuantBotOrderDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['BUY', 'SELL'], enumName: 'QuantOrderSide' })
  side: 'BUY' | 'SELL';
  @ApiProperty({ enum: ['LIMIT', 'MARKET'], enumName: 'QuantOrderType' })
  type: 'LIMIT' | 'MARKET';
  @ApiPropertyOptional() price?: number;
  @ApiPropertyOptional() size?: number;
  @ApiPropertyOptional() amount?: number;
  @ApiProperty() filledSize: number;
  @ApiProperty() filledAmount: number;
  @ApiProperty() fee: number;
  @ApiProperty({
    enum: ['open', 'filled', 'canceled', 'rejected'],
    enumName: 'QuantBotOrderStatus',
  })
  status: 'open' | 'filled' | 'canceled' | 'rejected';
  @ApiPropertyOptional() tag?: string;
  @ApiProperty() createdAt: Date;
}

export class QuantBotFillDto {
  @ApiProperty() id: string;
  @ApiProperty() orderId: string;
  @ApiProperty({ enum: ['BUY', 'SELL'], enumName: 'QuantOrderSide' })
  side: 'BUY' | 'SELL';
  @ApiProperty() price: number;
  @ApiProperty() size: number;
  @ApiProperty() fee: number;
  @ApiProperty() feeCoin: string;
  @ApiProperty() filledAt: Date;
}

export class QuantBotEventDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: '事件種類，例如 started、stopped、risk_blocked' })
  kind: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  payload?: Record<string, unknown>;
  @ApiProperty() createdAt: Date;
}

export class WebhookSignalDto {
  @ApiProperty() @IsString() @IsNotEmpty() token: string;

  @ApiProperty({ enum: WEBHOOK_ACTIONS, enumName: 'QuantWebhookAction' })
  @IsIn(WEBHOOK_ACTIONS)
  action: (typeof WEBHOOK_ACTIONS)[number];

  @ApiPropertyOptional({ description: '買入金額（計價幣），省略則用預設' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ description: '訊號 id，重送同一個 id 只會執行一次' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  id?: string;
}

class BacktestBaseDto {
  @ApiProperty({ example: 'BTC_USDT' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({
    enum: PIONEX_KLINE_INTERVALS,
    enumName: 'QuantCandleInterval',
    description: '撮合用的 K 線週期；指標策略以設定的週期為準',
  })
  @IsIn(PIONEX_KLINE_INTERVALS)
  interval: PionexKlineInterval;

  @ApiProperty({ description: '回測 K 線數量（交易所最多往回 10000 根）' })
  @IsInt()
  @Min(50)
  @Max(10000)
  candleCount: number;

  @ApiProperty() @IsNumber() @IsPositive() investment: number;

  @ApiProperty({ description: '手續費率（例如 0.0005）' })
  @IsNumber()
  @Min(0)
  @Max(0.01)
  feeRate: number;
}

export class GridBacktestDto extends BacktestBaseDto {
  @ApiProperty({ type: GridConfigDto })
  @ValidateNested()
  @Type(() => GridConfigDto)
  config: GridConfigDto;
}

export class DcaBacktestDto extends BacktestBaseDto {
  @ApiProperty({ type: DcaConfigDto })
  @ValidateNested()
  @Type(() => DcaConfigDto)
  config: DcaConfigDto;
}

export class IndicatorBacktestDto extends BacktestBaseDto {
  @ApiProperty({ type: IndicatorConfigDto })
  @ValidateNested()
  @Type(() => IndicatorConfigDto)
  config: IndicatorConfigDto;
}

export type BacktestDto =
  | GridBacktestDto
  | DcaBacktestDto
  | IndicatorBacktestDto;

export class BacktestPointDto {
  @ApiProperty() time: number;
  @ApiProperty() value: number;
}

export class BacktestTradeDto {
  @ApiProperty({ enum: ['BUY', 'SELL'], enumName: 'QuantOrderSide' })
  side: 'BUY' | 'SELL';
  @ApiProperty() price: number;
  @ApiProperty() size: number;
  @ApiProperty() time: number;
}

export class BacktestResultDto {
  @ApiProperty({ type: [BacktestPointDto] }) equity: BacktestPointDto[];
  @ApiProperty({ type: [BacktestTradeDto] }) trades: BacktestTradeDto[];
  @ApiProperty({ description: '總損益（計價幣）' }) pnl: number;
  @ApiProperty({ description: '報酬率（0.1 = 10%）' }) returnRate: number;
  @ApiProperty({ description: '最大回撤（0.1 = 10%）' }) maxDrawdown: number;
  @ApiPropertyOptional({ description: '年化夏普值' }) sharpe?: number;
  @ApiPropertyOptional({ description: '勝率（賣出成交中獲利的比例）' })
  winRate?: number;
  @ApiProperty() tradeCount: number;
  @ApiPropertyOptional({ description: '提前停止的原因，例如觸發停損' })
  stoppedReason?: string;
  @ApiProperty({ description: '回測區間起點（毫秒）' }) from: number;
  @ApiProperty({ description: '回測區間終點（毫秒）' }) to: number;
}

export class GridAiStrategyDto {
  @ApiProperty({ description: '建議上界' }) top: number;
  @ApiProperty({ description: '建議下界' }) bottom: number;
  @ApiProperty({ description: '建議格數' }) row: number;
  @ApiProperty({ description: '回測年化報酬（0.1 = 10%）' }) annualized: number;
  @ApiProperty({ description: '回測最大回撤（0.1 = 10%）' })
  maxDrawdown: number;
}
