import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
  PickType,
} from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
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

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

import {
  PIONEX_KLINE_INTERVALS,
  type PionexKlineInterval,
} from '../pionex/pionex.types';

export const QUANT_BOT_TYPES = [
  'grid',
  'dca',
  'indicator',
  'webhook',
  'futures_grid',
  'signal',
  'ai',
] as const;
export const FUTURES_BOT_TYPES = ['futures_grid', 'signal'] as const;
/** 可以設單筆金額上限的自建策略；AI 的上限在自己的設定裡，網格的每格金額由投入決定 */
export const ORDER_LIMIT_BOT_TYPES = ['dca', 'indicator', 'webhook'] as const;
export const QUANT_BOT_EXECUTORS = ['pionex', 'engine'] as const;
export const QUANT_BOT_MODES = ['paper', 'live'] as const;
export const QUANT_BOT_STATUSES = ['running', 'stopped', 'error'] as const;
export const GRID_TYPES = ['arithmetic', 'geometric'] as const;
export const GRID_STOP_TYPES = [
  'price',
  'profit_amount',
  'profit_ratio',
] as const;
export const FUTURES_GRID_STOP_TYPES = [
  ...GRID_STOP_TYPES,
  'price_limit',
] as const;
export const GRID_CLOSE_MODELS = ['NOT_SELL', 'TO_QUOTE'] as const;
export const TRIGGER_DIRECTIONS = ['above', 'below'] as const;
export const FUTURES_GRID_TRENDS = ['long', 'short', 'no_trend'] as const;
export const FUTURES_DIRECTIONS = ['long', 'short'] as const;
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
export const SIGNAL_ACTIONS = ['buy', 'sell'] as const;
export const AI_EFFORTS = ['low', 'medium', 'high'] as const;
export const AI_LOCALES = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'] as const;

export type QuantBotType = (typeof QUANT_BOT_TYPES)[number];
export type FuturesBotType = (typeof FUTURES_BOT_TYPES)[number];
export type SpotBotType = Exclude<QuantBotType, FuturesBotType>;

export const isFuturesBotType = (type: QuantBotType): type is FuturesBotType =>
  (FUTURES_BOT_TYPES as readonly string[]).includes(type);

interface BotShape {
  config: unknown;
  type: QuantBotType;
}

const futuresPositionOf = (config: unknown) =>
  (config as { futures?: FuturesPositionConfigDto } | null)?.futures;

/** 合約網格、訊號機器人，以及帶 futures 設定（交易對是合約）的 DCA／指標／Webhook */
export const isFuturesBot = ({ config, type }: BotShape) =>
  isFuturesBotType(type) || !!futuresPositionOf(config);

export const futuresMarginOf = ({ config, type }: BotShape) => {
  const position = futuresPositionOf(config);
  if (position) return { extraMargin: 0, leverage: position.leverage };

  const { extraMargin, leverage } = config as {
    extraMargin?: number;
    leverage: number;
  };

  return {
    extraMargin: type === 'futures_grid' ? (extraMargin ?? 0) : 0,
    leverage,
  };
};
export type QuantBotMode = (typeof QUANT_BOT_MODES)[number];
export type QuantBotExecutor = (typeof QUANT_BOT_EXECUTORS)[number];

/** 實盤的網格、合約網格、訊號機器人交給 Pionex 執行，其餘由本系統的引擎執行 */
export const executorOf = ({
  mode,
  type,
}: {
  mode: QuantBotMode;
  type: QuantBotType;
}): QuantBotExecutor =>
  mode === 'live' &&
  (type === 'grid' || type === 'futures_grid' || type === 'signal')
    ? 'pionex'
    : 'engine';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class GridStopDto {
  @ApiProperty({ enum: GRID_STOP_TYPES, enumName: 'QuantGridStopType' })
  @IsIn(GRID_STOP_TYPES)
  type: (typeof GRID_STOP_TYPES)[number];

  @ApiProperty({
    description:
      'price：觸發價；profit_amount：金額（計價幣）；profit_ratio：相對投入的 %。停損也填正數',
  })
  @IsNumber()
  @IsPositive()
  value: number;
}

export class FuturesGridStopDto {
  @ApiProperty({
    enum: FUTURES_GRID_STOP_TYPES,
    enumName: 'QuantFuturesGridStopType',
  })
  @IsIn(FUTURES_GRID_STOP_TYPES)
  type: (typeof FUTURES_GRID_STOP_TYPES)[number];

  @ApiProperty({
    description:
      'price、price_limit：觸發價；profit_amount：金額（計價幣）；profit_ratio：相對投入的 %。停損也填正數',
  })
  @IsNumber()
  @IsPositive()
  value: number;

  @ApiPropertyOptional({ description: 'price_limit：觸發後掛限價單平倉的價格' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  limitPrice?: number;
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

  @ApiPropertyOptional({
    description:
      '實盤：初始買入價格最多高於下單時價格的 %；省略時依 Pionex 預設，模擬盤與回測不使用',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  slippage?: number;
}

// https://www.pionex.com/docs/api-docs/bot-api/futures-grid
export class FuturesGridConfigDto {
  @ApiProperty({ description: '上界' }) @IsNumber() @IsPositive() top: number;
  @ApiProperty({ description: '下界' })
  @IsNumber()
  @IsPositive()
  bottom: number;

  @ApiProperty({ description: '格數', minimum: 2, maximum: 500 })
  @IsInt()
  @Min(2)
  @Max(500)
  row: number;

  @ApiProperty({ enum: GRID_TYPES, enumName: 'QuantGridType' })
  @IsIn(GRID_TYPES)
  gridType: (typeof GRID_TYPES)[number];

  @ApiProperty({
    enum: FUTURES_GRID_TRENDS,
    enumName: 'QuantFuturesGridTrend',
    description: 'long 做多、short 做空、no_trend 中性',
  })
  @IsIn(FUTURES_GRID_TRENDS)
  trend: (typeof FUTURES_GRID_TRENDS)[number];

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  leverage: number;

  @ApiPropertyOptional({
    description: '額外保證金（計價幣），不參與網格交易、只用來拉遠強平價',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  extraMargin?: number;

  @ApiPropertyOptional({
    type: FuturesGridStopDto,
    description: 'price：做多與中性為下方停損價、做空為上方停損價',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FuturesGridStopDto)
  lossStop?: FuturesGridStopDto;

  @ApiPropertyOptional({ description: '中性網格的上方停損價' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  lossStopHigh?: number;

  @ApiPropertyOptional({
    description: '中性網格的上方停損限價，停損方式為 price_limit 時使用',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  lossStopLimitHigh?: number;

  @ApiPropertyOptional({
    type: FuturesGridStopDto,
    description:
      'price：做多為上方停利價、做空為下方停利價；中性只能用金額或比例',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FuturesGridStopDto)
  profitStop?: FuturesGridStopDto;

  @ApiPropertyOptional({ type: TriggerDto, description: '價格觸及才開始' })
  @IsOptional()
  @ValidateNested()
  @Type(() => TriggerDto)
  trigger?: TriggerDto;

  @ApiPropertyOptional({
    description:
      '實盤：開倉成交價最多偏離下單時價格的 %；省略時依 Pionex 預設，模擬盤與回測不使用',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  slippage?: number;
}

// https://www.pionex.com/docs/api-docs/bot-api/smart-copy
export class SignalBotConfigDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  leverage: number;

  @ApiPropertyOptional({ description: '停利（%，相對投入），由 Pionex 執行' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(10000)
  takeProfit?: number;

  @ApiPropertyOptional({ description: '停損（%，相對投入），由 Pionex 執行' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(100)
  stopLoss?: number;

  @ApiProperty({ description: '獲利是否滾入下一筆的本金' })
  @IsBoolean()
  compound: boolean;
}

/** 合約交易對才需要：DCA、指標、Webhook 策略只做單一方向 */
export class FuturesPositionConfigDto {
  @ApiProperty({ enum: FUTURES_DIRECTIONS, enumName: 'QuantFuturesDirection' })
  @IsIn(FUTURES_DIRECTIONS)
  direction: (typeof FUTURES_DIRECTIONS)[number];

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  leverage: number;
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
  @ApiPropertyOptional({
    type: FuturesPositionConfigDto,
    description: '合約交易對必填，現貨不可填',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FuturesPositionConfigDto)
  futures?: FuturesPositionConfigDto;
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
  @ApiPropertyOptional({
    type: FuturesPositionConfigDto,
    description: '合約交易對必填，現貨不可填',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FuturesPositionConfigDto)
  futures?: FuturesPositionConfigDto;
}

// AI 只能回傳結構化的決策，下單仍經過機器人自己的資金與風控檢查
export class AiConfigDto {
  @ApiProperty({
    enum: PIONEX_KLINE_INTERVALS,
    enumName: 'QuantCandleInterval',
    description: '每根 K 線收盤時請 AI 判斷一次',
  })
  @IsIn(PIONEX_KLINE_INTERVALS)
  interval: PionexKlineInterval;

  @ApiPropertyOptional({
    description: '交易方針（風格、可承受的風險等），會放進給 AI 的指示',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  guideline?: string;

  @ApiProperty({ description: '每次開倉的金額上限（計價幣名目）' })
  @IsNumber()
  @IsPositive()
  maxOrderAmount: number;

  @ApiProperty({ description: '每月 AI 費用上限（美元），超過就停止機器人' })
  @IsNumber()
  @IsPositive()
  monthlyCostLimit: number;

  @ApiProperty({ enum: AI_EFFORTS, enumName: 'QuantAiEffort' })
  @IsIn(AI_EFFORTS)
  effort: (typeof AI_EFFORTS)[number];

  @ApiProperty({
    enum: AI_LOCALES,
    enumName: 'QuantAiLocale',
    description: 'AI 寫判斷理由用的語言',
  })
  @IsIn(AI_LOCALES)
  locale: (typeof AI_LOCALES)[number];

  @ApiPropertyOptional({ description: '停利（%，相對持倉均價），由系統強制' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(1000)
  takeProfit?: number;

  @ApiPropertyOptional({ description: '停損（%，相對持倉均價），由系統強制' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(100)
  stopLoss?: number;

  @ApiPropertyOptional({
    type: FuturesPositionConfigDto,
    description: '合約交易對必填，現貨不可填',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FuturesPositionConfigDto)
  futures?: FuturesPositionConfigDto;
}

export class WebhookConfigDto {
  @ApiProperty({ description: '訊號未指定金額時的每次買入金額（計價幣）' })
  @IsNumber()
  @IsPositive()
  orderAmount: number;
  @ApiPropertyOptional({
    type: FuturesPositionConfigDto,
    description: '合約交易對必填，現貨不可填',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FuturesPositionConfigDto)
  futures?: FuturesPositionConfigDto;
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

  @ApiPropertyOptional({
    description:
      'DCA／指標／Webhook：開倉單的單筆金額上限（計價幣），超過就略過；平倉不受限',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxOrderAmount?: number;
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

export class CreateFuturesGridBotDto extends CreateQuantBotBaseDto {
  @ApiProperty({ type: FuturesGridConfigDto })
  @ValidateNested()
  @Type(() => FuturesGridConfigDto)
  config: FuturesGridConfigDto;
}

export class CreateSignalBotDto extends CreateQuantBotBaseDto {
  @ApiProperty({ type: SignalBotConfigDto })
  @ValidateNested()
  @Type(() => SignalBotConfigDto)
  config: SignalBotConfigDto;
}

export class CreateAiBotDto extends CreateQuantBotBaseDto {
  @ApiProperty({ type: AiConfigDto })
  @ValidateNested()
  @Type(() => AiConfigDto)
  config: AiConfigDto;
}

export type CreateQuantBotDto =
  | CreateAiBotDto
  | CreateSignalBotDto
  | CreateFuturesGridBotDto
  | CreateGridBotDto
  | CreateDcaBotDto
  | CreateIndicatorBotDto
  | CreateWebhookBotDto;

export class QuantBotSummaryDto {
  @ApiProperty({ description: '目前權益（計價幣）' }) equity: number;
  @ApiProperty({ description: '總損益（計價幣）' }) pnl: number;
  @ApiProperty({
    description:
      '已實現損益（計價幣）；網格機器人為網格利潤，Pionex 網格扣掉已提取的部分',
  })
  realizedPnl: number;
  @ApiProperty({
    description:
      '浮動盈虧＝持倉 ×（現價 − 持倉均價）；Pionex 網格與 App 一致，為總損益 − 網格利潤',
  })
  floatingPnl: number;
  @ApiPropertyOptional({
    description: '總損益相對投入的年化報酬率（比例）；尚未啟動時不回傳',
  })
  annualizedReturn?: number;
  @ApiPropertyOptional({
    description: '網格：網格利潤相對投入的年化報酬率（比例）；尚未啟動時不回傳',
  })
  gridAnnualizedReturn?: number;
  @ApiProperty({ description: '持有基礎幣數量；合約做空為負數' })
  position: number;
  @ApiProperty({ description: '持倉均價' }) averageCost: number;
  @ApiProperty({ description: '成交筆數' }) fillCount: number;
  @ApiPropertyOptional({ description: '合約：預估強平價' })
  liquidationPrice?: number;
  @ApiPropertyOptional({
    description: '合約：預估強平價與現價的距離（比例）',
  })
  liquidationDistance?: number;
  @ApiPropertyOptional({ description: 'Pionex 現貨網格：建立時的市價' })
  openPrice?: number;
  @ApiPropertyOptional({ description: '合約：累計資金費（正數為收入）' })
  fundingFee?: number;
  @ApiPropertyOptional({
    description: 'Pionex 機器人目前的狀態，例如 running、paused',
  })
  pionexStatus?: string;
  @ApiPropertyOptional({ description: 'AI：本月（UTC）已花費的費用（美元）' })
  aiMonthCost?: number;
  @ApiPropertyOptional({ description: 'Pionex 網格：已提取的利潤' })
  profitWithdrawn?: number;
  @ApiPropertyOptional({
    description: '向 Pionex 查詢失敗的原因；有值時其他數字都不是實際狀態',
  })
  pionexError?: string;
}

@ApiExtraModels(
  AiConfigDto,
  FuturesGridConfigDto,
  SignalBotConfigDto,
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
      { $ref: getSchemaPath(FuturesGridConfigDto) },
      { $ref: getSchemaPath(SignalBotConfigDto) },
      { $ref: getSchemaPath(AiConfigDto) },
    ],
  })
  config:
    | AiConfigDto
    | SignalBotConfigDto
    | GridConfigDto
    | DcaConfigDto
    | IndicatorConfigDto
    | WebhookConfigDto
    | FuturesGridConfigDto;
  @ApiProperty() investment: number;
  @ApiPropertyOptional() paperFeeRate?: number;
  @ApiPropertyOptional() maxDailyLoss?: number;
  @ApiPropertyOptional() maxOrderAmount?: number;
  @ApiProperty({
    enum: QUANT_BOT_EXECUTORS,
    enumName: 'QuantBotExecutor',
    description: 'pionex：交給 Pionex 執行；engine：由本系統執行',
  })
  executor: QuantBotExecutor;
  @ApiPropertyOptional({ description: 'Pionex 內建機器人 id' })
  pionexBotId?: string;
  @ApiProperty({ type: QuantBotSummaryDto }) summary: QuantBotSummaryDto;
  @ApiPropertyOptional() startedAt?: Date;
  @ApiPropertyOptional() stoppedAt?: Date;
  @ApiProperty() createdAt: Date;
}

export class StopQuantBotDto {
  @ApiPropertyOptional({
    enum: GRID_CLOSE_MODELS,
    enumName: 'QuantGridCloseModel',
    description: '只用於現貨網格；省略時依建立時的設定',
  })
  @IsOptional()
  @IsIn(GRID_CLOSE_MODELS)
  closeModel?: (typeof GRID_CLOSE_MODELS)[number];
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

export class FuturesGridBacktestDto extends BacktestBaseDto {
  @ApiProperty({ type: FuturesGridConfigDto })
  @ValidateNested()
  @Type(() => FuturesGridConfigDto)
  config: FuturesGridConfigDto;
}

export type BacktestDto =
  | FuturesGridBacktestDto
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

export class WebhookTokenDto {
  @ApiProperty({ description: '新的 token，只在這次回傳；舊 token 立即失效' })
  webhookToken: string;
}

export class FuturesGridCheckDto {
  @ApiProperty() @IsString() @IsNotEmpty() credentialId: string;

  @ApiProperty({ example: 'BTC_USDT_PERP' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty() @IsNumber() @IsPositive() investment: number;

  @ApiProperty({ type: FuturesGridConfigDto })
  @ValidateNested()
  @Type(() => FuturesGridConfigDto)
  config: FuturesGridConfigDto;
}

export class FuturesGridCheckResultDto {
  @ApiPropertyOptional({ description: '最小投入（不含額外保證金）' })
  minInvestment?: number;
  @ApiPropertyOptional({ description: '最大投入（不含額外保證金）' })
  maxInvestment?: number;
  @ApiPropertyOptional({ description: '每格數量（基礎幣）' })
  perVolume?: number;
  @ApiPropertyOptional({ description: '下方預估強平價' })
  liquidationPriceDown?: number;
  @ApiPropertyOptional({ description: '上方預估強平價' })
  liquidationPriceUp?: number;
}

export class GridCheckDto {
  @ApiProperty() @IsString() @IsNotEmpty() credentialId: string;

  @ApiProperty({ example: 'BTC_USDT' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty() @IsNumber() @IsPositive() investment: number;

  @ApiProperty({ type: GridConfigDto })
  @ValidateNested()
  @Type(() => GridConfigDto)
  config: GridConfigDto;
}

export class GridCheckResultDto {
  @ApiPropertyOptional() minInvestment?: number;
  @ApiPropertyOptional() maxInvestment?: number;
  @ApiPropertyOptional({ description: '每格數量（基礎幣）' })
  perVolume?: number;
  @ApiPropertyOptional({ description: '預估開倉手續費（計價幣）' })
  fee?: number;
}

export const GRID_OPERATIONS = ['invest', 'range', 'profit'] as const;

// https://www.pionex.com/docs/api-docs/bot-api/spot-grid
export class GridOperationDto {
  @ApiProperty({ enum: GRID_OPERATIONS, enumName: 'QuantGridOperation' })
  @IsIn(GRID_OPERATIONS)
  operation: (typeof GRID_OPERATIONS)[number];

  @ApiPropertyOptional({
    description: 'invest：追加投入；profit：提取的利潤（計價幣）',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ description: 'range：新上界' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  top?: number;

  @ApiPropertyOptional({ description: 'range：新下界' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  bottom?: number;

  @ApiPropertyOptional({
    description: 'range：新格數',
    minimum: 2,
    maximum: 200,
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(200)
  row?: number;
}

export class SignalSetupDto {
  @ApiProperty({
    description:
      '填到 TradingView alert 的 Webhook URL（含 Pionex 的 token，請勿外流）',
  })
  webhookUrl: string;
  @ApiProperty({ description: 'TradingView alert 的訊息範本' }) message: string;
}

export class SendSignalDto {
  @ApiProperty({ enum: SIGNAL_ACTIONS, enumName: 'QuantSignalAction' })
  @IsIn(SIGNAL_ACTIONS)
  action: (typeof SIGNAL_ACTIONS)[number];

  @ApiProperty({ description: '這筆訊號的數量，對應 TradingView 的 contracts' })
  @IsNumber()
  @IsPositive()
  contracts: number;

  @ApiProperty({
    description:
      '訊號送出後的目標部位，對應 TradingView 的 position_size：正數做多、負數做空、0 平倉',
  })
  @IsNumber()
  positionSize: number;
}

export const FUTURES_GRID_OPERATIONS = [
  'invest',
  'range',
  'reinvest',
  'reduce',
  'pause',
  'resume',
  'addMargin',
  'reduceMargin',
  'stops',
] as const;
export const FUTURES_GRID_PAUSE_MODES = ['immediate', 'conditional'] as const;

export type FuturesGridOperation = (typeof FUTURES_GRID_OPERATIONS)[number];

// https://www.pionex.com/docs/api-docs/bot-api/futures-grid
export class FuturesGridOperationDto {
  @ApiProperty({
    enum: FUTURES_GRID_OPERATIONS,
    enumName: 'QuantFuturesGridOperation',
  })
  @IsIn(FUTURES_GRID_OPERATIONS)
  operation: FuturesGridOperation;

  @ApiPropertyOptional({
    description: 'invest：追加投入；addMargin／reduceMargin：保證金金額',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ description: 'range：新上界' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  top?: number;

  @ApiPropertyOptional({ description: 'range：新下界' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  bottom?: number;

  @ApiPropertyOptional({
    description: 'range：新格數',
    minimum: 2,
    maximum: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(500)
  row?: number;

  @ApiPropertyOptional({
    description:
      'reduce：減倉份數，以每格數量為單位，上限見試算的 maxReduceNum',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  reduceNum?: number;

  @ApiPropertyOptional({
    enum: FUTURES_GRID_PAUSE_MODES,
    enumName: 'QuantFuturesGridPauseMode',
  })
  @IsOptional()
  @IsIn(FUTURES_GRID_PAUSE_MODES)
  pauseMode?: (typeof FUTURES_GRID_PAUSE_MODES)[number];

  @ApiPropertyOptional({
    description: 'pause：暫停期間是否仍允許觸發停利，預設 true',
  })
  @IsOptional()
  @IsBoolean()
  stopProfitEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'pause：暫停期間是否仍允許觸發停損，預設 true',
  })
  @IsOptional()
  @IsBoolean()
  stopLossEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'pause／resume：價格漲到此價才暫停或恢復，須高於現價',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  triggerUp?: number;

  @ApiPropertyOptional({
    description: 'pause／resume：價格跌到此價才暫停或恢復，須低於現價',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  triggerDown?: number;

  @ApiPropertyOptional({
    type: FuturesGridStopDto,
    nullable: true,
    description: 'stops：停損，null 代表清除',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FuturesGridStopDto)
  lossStop?: FuturesGridStopDto | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'stops：中性網格的上方停損價，null 代表清除',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  lossStopHigh?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'stops：中性網格的上方停損限價，null 代表清除',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  lossStopLimitHigh?: number | null;

  @ApiPropertyOptional({
    type: FuturesGridStopDto,
    nullable: true,
    description: 'stops：停利，null 代表清除',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FuturesGridStopDto)
  profitStop?: FuturesGridStopDto | null;
}

export class FuturesGridOperationCheckDto {
  @ApiProperty() ok: boolean;
  @ApiPropertyOptional({ description: 'Pionex 回傳的不可執行原因' })
  reason?: string;
  @ApiPropertyOptional() minInvestment?: number;
  @ApiPropertyOptional() maxInvestment?: number;
  @ApiPropertyOptional({ description: '最多可減少的保證金' })
  maxAmount?: number;
  @ApiPropertyOptional({ description: '最多可減倉的份數' })
  maxReduceNum?: number;
  @ApiPropertyOptional({ description: '調整後每格數量' }) perVolume?: number;
  @ApiPropertyOptional() reduceAmount?: number;
  @ApiPropertyOptional({ description: '減倉實現的盈虧' }) reducePnl?: number;
  @ApiPropertyOptional() liquidationPriceUpBefore?: number;
  @ApiPropertyOptional() liquidationPriceDownBefore?: number;
  @ApiPropertyOptional() liquidationPriceUpAfter?: number;
  @ApiPropertyOptional() liquidationPriceDownAfter?: number;
}

export class QuantAiKeyDto {
  @ApiProperty() configured: boolean;
  @ApiPropertyOptional({ description: 'Claude API key 末 4 碼' })
  apiKeyLast4?: string;
  @ApiPropertyOptional() createdAt?: Date;
  @ApiProperty({ description: '本月（UTC）所有 AI 機器人的費用（美元）' })
  monthCost: number;
}

export class SetQuantAiKeyDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  apiKey: string;
}

export const QUANT_BOT_STRING_FILTER_FIELDS = ['name', 'symbol'] as const;
export const QUANT_BOT_ENUM_FILTER_FIELDS = [
  'type',
  'executor',
  'mode',
  'status',
] as const;
export const QUANT_BOT_NUMBER_FILTER_FIELDS = ['investment'] as const;
export const QUANT_BOT_DATE_FILTER_FIELDS = ['startedAt'] as const;
export const QUANT_BOT_ALL_FILTER_FIELDS = [
  ...QUANT_BOT_STRING_FILTER_FIELDS,
  ...QUANT_BOT_ENUM_FILTER_FIELDS,
  ...QUANT_BOT_NUMBER_FILTER_FIELDS,
  ...QUANT_BOT_DATE_FILTER_FIELDS,
] as const;

export type QuantBotFilterField = (typeof QUANT_BOT_ALL_FILTER_FIELDS)[number];

// 損益要即時算，不在資料庫裡，無法排序或篩選
export const QUANT_BOT_SORT_FIELDS = QUANT_BOT_ALL_FILTER_FIELDS;

export type QuantBotSortField = (typeof QUANT_BOT_SORT_FIELDS)[number];

export class QuantBotPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: QUANT_BOT_ALL_FILTER_FIELDS,
    enumName: 'QuantBotFilterField',
  })
  @IsOptional()
  @IsIn(QUANT_BOT_ALL_FILTER_FIELDS)
  filterField?: QuantBotFilterField;

  @ApiPropertyOptional({
    enum: QUANT_BOT_SORT_FIELDS,
    enumName: 'QuantBotSortField',
  })
  @IsOptional()
  @IsIn(QUANT_BOT_SORT_FIELDS)
  sortBy?: QuantBotSortField;
}

class BotRecordPaginationQueryDto extends PickType(PaginationQueryDto, [
  'limit',
  'offset',
  'sortDirection',
] as const) {}

export const QUANT_BOT_ORDER_SORT_FIELDS = [
  'createdAt',
  'side',
  'type',
  'price',
  'filledSize',
  'status',
  'tag',
] as const;

export type QuantBotOrderSortField =
  (typeof QUANT_BOT_ORDER_SORT_FIELDS)[number];

export class QuantBotOrderPaginationQueryDto extends BotRecordPaginationQueryDto {
  @ApiPropertyOptional({
    enum: QUANT_BOT_ORDER_SORT_FIELDS,
    enumName: 'QuantBotOrderSortField',
  })
  @IsOptional()
  @IsIn(QUANT_BOT_ORDER_SORT_FIELDS)
  sortBy?: QuantBotOrderSortField;
}

export const QUANT_BOT_FILL_SORT_FIELDS = [
  'filledAt',
  'side',
  'price',
  'size',
  'fee',
] as const;

export type QuantBotFillSortField = (typeof QUANT_BOT_FILL_SORT_FIELDS)[number];

export class QuantBotFillPaginationQueryDto extends BotRecordPaginationQueryDto {
  @ApiPropertyOptional({
    enum: QUANT_BOT_FILL_SORT_FIELDS,
    enumName: 'QuantBotFillSortField',
  })
  @IsOptional()
  @IsIn(QUANT_BOT_FILL_SORT_FIELDS)
  sortBy?: QuantBotFillSortField;
}

export const QUANT_BOT_EVENT_SORT_FIELDS = ['createdAt', 'kind'] as const;

export type QuantBotEventSortField =
  (typeof QUANT_BOT_EVENT_SORT_FIELDS)[number];

export class QuantBotEventPaginationQueryDto extends BotRecordPaginationQueryDto {
  @ApiPropertyOptional({
    enum: QUANT_BOT_EVENT_SORT_FIELDS,
    enumName: 'QuantBotEventSortField',
  })
  @IsOptional()
  @IsIn(QUANT_BOT_EVENT_SORT_FIELDS)
  sortBy?: QuantBotEventSortField;

  @ApiPropertyOptional({
    description: '只列這些種類的事件，例如 AI 決策紀錄',
    isArray: true,
    type: String,
  })
  @IsOptional()
  @Transform(({ value }: { value: string | string[] }) =>
    Array.isArray(value) ? value : [value],
  )
  @IsString({ each: true })
  kinds?: string[];
}

export class QuantBotFillMarkerQueryDto {
  @ApiProperty({ description: '只回傳此時間之後的成交', format: 'date-time' })
  @IsDateString()
  since: string;
}

export class QuantBotFillMarkerDto {
  @ApiProperty({ enum: ['BUY', 'SELL'], enumName: 'QuantOrderSide' })
  side: 'BUY' | 'SELL';
  @ApiProperty() price: number;
  @ApiProperty() filledAt: Date;
}

export class QuantBotEquityPointDto {
  @ApiProperty() time: Date;
  @ApiProperty({ description: '權益（計價幣）' }) equity: number;
  @ApiProperty({ description: '總損益（計價幣）' }) pnl: number;
}
