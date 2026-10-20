import type { GridConfigDto } from '../dto/quant-bot.dto';
import type { QuantCandleDto } from '../dto/quant-market.dto';
import type { PionexKlineInterval } from '../pionex/pionex.types';

import type { Ledger } from './ledger';
import type { AiDecision } from './strategies/ai.strategy';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';

export interface SymbolSpec {
  amountPrecision: number;
  base: string;
  maxTradeSize: number;
  minAmount: number;
  minTradeSize: number;
  pricePrecision: number;
  quote: string;
  sizePrecision: number;
  symbol: string;
}

export interface OrderRequest {
  /** 市價買單的金額（計價幣） */
  amount?: number;
  price?: number;
  side: OrderSide;
  /** 基礎幣數量；市價買單不用 */
  size?: number;
  /** 策略自己的標記，重啟後用來還原狀態 */
  tag?: string;
  type: OrderType;
}

export interface BotOrder {
  amount?: number;
  filledAmount: number;
  filledSize: number;
  id: string;
  price?: number;
  side: OrderSide;
  size?: number;
  status: 'open' | 'filled' | 'canceled' | 'rejected';
  tag?: string;
  type: OrderType;
}

export interface BotFill {
  /** 實盤成交用交易所的成交 id，對帳時用來去重 */
  id?: string;
  fee: number;
  /** 買入通常扣收到的基礎幣、賣出扣收到的計價幣 */
  feeAsset: 'base' | 'quote';
  orderId: string;
  price: number;
  side: OrderSide;
  size: number;
  time: number;
}

export interface WebhookSignal {
  action: 'buy' | 'sell' | 'close';
  amount?: number;
}

export interface StrategyContext<L = Ledger> {
  readonly config: unknown;
  readonly investment: number;
  readonly spec: SymbolSpec;

  candles(
    interval: PionexKlineInterval,
    count: number,
  ): Promise<QuantCandleDto[]>;
  cancelAll(): Promise<void>;
  cancelOrder(orderId: string): Promise<void>;
  fills(): readonly BotFill[];
  findOrder(orderId: string): BotOrder | undefined;
  lastPrice(): number | null;
  ledger(): L;
  log(kind: string, payload?: Record<string, unknown>): void;
  now(): number;
  openOrders(): readonly BotOrder[];
  /** 被風控擋下或數量低於交易所下限時回傳 null */
  placeOrder(request: OrderRequest): Promise<BotOrder | null>;
  /** 在機器人的序列佇列裡執行；給不在佇列內產生結果的工作（例如等 AI 回應）使用 */
  schedule(task: () => Promise<void>): Promise<void>;
  stop(reason: string): Promise<void>;
}

export interface Strategy {
  onCandleClose?(candle: QuantCandleDto): Promise<void>;
  onFill?(order: BotOrder, fill: BotFill): Promise<void>;
  onPrice?(price: number): Promise<void>;
  onSignal?(signal: WebhookSignal): Promise<void>;
  onAiDecision?(
    decision: AiDecision,
    meta: Record<string, unknown>,
  ): Promise<void>;
  /** 重啟後也會呼叫；策略要從 openOrders／fills 判斷是首次啟動還是續跑 */
  start(): Promise<void>;
  /** 使用者停止時的收尾，例如網格的平倉方式 */
  stop?(closeModel?: GridConfigDto['closeModel']): Promise<void>;
}
