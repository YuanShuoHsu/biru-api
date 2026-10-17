import { BollingerBands, EMA, MACD, RSI } from 'technicalindicators';

import type { AiConfigDto } from '../../dto/quant-bot.dto';
import type { QuantCandleDto } from '../../dto/quant-market.dto';
import type { PionexKlineInterval } from '../../pionex/pionex.types';
import type { Strategy, StrategyContext } from '../types';

import { adverse, favorable, type Trader } from './trader';

const DECISION_CANDLES = 120;
const CONTEXT_CANDLES = 30;
const CONTEXT_INTERVALS: PionexKlineInterval[] = ['4H', '1D'];

export interface AiDecision {
  action: 'open' | 'close' | 'hold';
  amount: number;
  closeRatio: number;
  confidence: number;
  reasoning: string;
}

export interface AiDecisionResult {
  cost: number;
  decision: AiDecision | null;
  model: string;
  refusal?: string;
  usage: { input: number; output: number };
}

export interface AiSnapshot {
  budget: number;
  candles: Record<string, number[][]>;
  direction: 'long' | 'short';
  indicators: Record<string, unknown>;
  lastPrice: number;
  leverage?: number;
  market: 'perpetual' | 'spot';
  maxOrderAmount: number;
  minOrderAmount: number;
  position: { averageCost: number; size: number; unrealizedPnl: number };
  symbol: string;
  time: string;
}

/** 由引擎提供：呼叫模型並計費，策略本身不碰 API key */
export interface AiAdvisor {
  decide(snapshot: AiSnapshot): Promise<AiDecisionResult>;
  monthCost(): Promise<number>;
}

const compact = (candles: QuantCandleDto[]) =>
  candles.map(({ close, high, low, open, time, volume }) => [
    time,
    open,
    high,
    low,
    close,
    volume,
  ]);

const last = <T>(values: T[]) => values.at(-1);

export const indicatorsOf = (closes: number[]) => ({
  bollinger20: last(
    BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }),
  ),
  ema20: last(EMA.calculate({ period: 20, values: closes })),
  ema50: last(EMA.calculate({ period: 50, values: closes })),
  macd: last(
    MACD.calculate({
      fastPeriod: 12,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
      slowPeriod: 26,
      signalPeriod: 9,
      values: closes,
    }),
  ),
  rsi14: last(RSI.calculate({ period: 14, values: closes })),
});

export class AiStrategy implements Strategy {
  private readonly config: AiConfigDto;
  private consulting = false;

  constructor(
    private readonly context: StrategyContext<unknown>,
    private readonly trader: Trader,
    private readonly advisor: AiAdvisor,
  ) {
    this.config = context.config as AiConfigDto;
  }

  start() {
    return Promise.resolve();
  }

  // 模型回應可能要數十秒，不在序列佇列裡等，否則停損與成交處理會被卡住
  onCandleClose(candle: QuantCandleDto) {
    if (!this.consulting) {
      this.consulting = true;
      void this.consult(candle).finally(() => (this.consulting = false));
    }

    return Promise.resolve();
  }

  async onPrice(price: number) {
    const { stopLoss, takeProfit } = this.config;
    const { direction } = this.trader;
    const { averageCost, size } = this.trader.holding();
    if (!this.holding(size, price)) return;

    const reason =
      takeProfit &&
      favorable(
        direction,
        price,
        averageCost * (1 + (direction * takeProfit) / 100),
      )
        ? 'take_profit'
        : stopLoss &&
            adverse(
              direction,
              price,
              averageCost * (1 - (direction * stopLoss) / 100),
            )
          ? 'stop_loss'
          : null;
    if (!reason) return;

    this.context.log('exit', { reason });
    await this.trader.closeMarket(size, `ai:${reason}`);
  }

  private holding(size: number, price: number) {
    const { minAmount, minTradeSize } = this.context.spec;

    return size >= minTradeSize && size * price >= minAmount;
  }

  private async consult(candle: QuantCandleDto) {
    try {
      if ((await this.advisor.monthCost()) >= this.config.monthlyCostLimit) {
        await this.context.schedule(() => this.context.stop('ai_cost_limit'));
        return;
      }

      const snapshot = await this.snapshot(candle);
      const result = await this.advisor.decide(snapshot);
      const common = {
        cost: result.cost,
        inputTokens: result.usage.input,
        model: result.model,
        outputTokens: result.usage.output,
        price: snapshot.lastPrice,
      };

      if (!result.decision) {
        this.context.log('ai_refusal', { ...common, reason: result.refusal });
        return;
      }

      const { decision } = result;
      await this.context.schedule(async () => {
        const skipReason = await this.apply(decision);
        this.context.log('ai_decision', {
          ...common,
          ...decision,
          executed: decision.action !== 'hold' && !skipReason,
          skipReason,
        });
      });
    } catch (error) {
      this.context.log('ai_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** 回傳沒有執行的原因；hold 或成功送出時回傳 undefined */
  private async apply({ action, amount, closeRatio }: AiDecision) {
    const price = this.context.lastPrice();
    if (!price || action === 'hold') return undefined;

    if (action === 'open') {
      const capped = Math.min(
        amount,
        this.config.maxOrderAmount,
        this.trader.budget(),
      );
      if (capped < this.context.spec.minAmount) return 'below_minimum';

      return (await this.trader.openMarket({ amount: capped, tag: 'ai:open' }))
        ? undefined
        : 'order_skipped';
    }

    const { size } = this.trader.holding();
    const closing = size * Math.min(1, closeRatio);
    if (!this.holding(closing, price)) return 'no_position';

    return (await this.trader.closeMarket(closing, 'ai:close'))
      ? undefined
      : 'order_skipped';
  }

  private async snapshot(candle: QuantCandleDto): Promise<AiSnapshot> {
    const { interval } = this.config;
    const decisionCandles = (
      await this.context.candles(interval, DECISION_CANDLES)
    ).filter(({ time }) => time <= candle.time);
    const contexts = await Promise.all(
      CONTEXT_INTERVALS.filter((value) => value !== interval).map(
        async (value) =>
          [
            value,
            compact(await this.context.candles(value, CONTEXT_CANDLES)),
          ] as const,
      ),
    );
    const lastPrice = this.context.lastPrice() ?? candle.close;
    const { averageCost, size } = this.trader.holding();
    const { direction } = this.trader;

    return {
      budget: this.trader.budget(),
      candles: Object.fromEntries([
        [interval, compact(decisionCandles.slice(-CONTEXT_CANDLES * 2))],
        ...contexts,
      ]),
      direction: direction > 0 ? 'long' : 'short',
      indicators: {
        [interval]: indicatorsOf(decisionCandles.map(({ close }) => close)),
      },
      lastPrice,
      leverage: this.config.futures?.leverage,
      market: this.config.futures ? 'perpetual' : 'spot',
      maxOrderAmount: this.config.maxOrderAmount,
      minOrderAmount: this.context.spec.minAmount,
      position: {
        averageCost,
        size,
        unrealizedPnl: (lastPrice - averageCost) * size * direction,
      },
      symbol: this.context.spec.symbol,
      time: new Date(this.context.now()).toISOString(),
    };
  }
}
