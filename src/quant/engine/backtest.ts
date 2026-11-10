import { futuresMarginOf, type QuantBotType } from '../dto/quant-bot.dto.js';
import type { QuantCandleDto } from '../dto/quant-market.dto.js';
import {
  candleEndOf,
  type PionexKlineInterval,
} from '../pionex/pionex.types.js';

import { SpotAccount } from './account.js';
import {
  BotSession,
  type SessionOptions,
  type SessionStore,
  type SubmittedOrder,
} from './bot-session.js';
import {
  FuturesAccount,
  type FuturesLedger,
  type RiskTier,
} from './futures-account.js';
import type { Ledger } from './ledger.js';
import { SimulatedBroker } from './simulated-broker.js';
import { createFuturesStrategy, createStrategy } from './strategies/index.js';
import type { AiAdvisor } from './strategies/ai.strategy.js';
import type { BotFill, SymbolSpec } from './types.js';

const DAY_MS = 86_400_000;

interface BacktestCommonInput {
  candles: QuantCandleDto[];
  config: unknown;
  interval: PionexKlineInterval;
  investment: number;
  spec: SymbolSpec;
}

export interface FuturesBacktestMarket {
  /** 依時間排序的歷史資金費率 */
  fundingRates: { rate: number; time: number }[];
  liquidationFeeRate: number;
  riskTiers: RiskTier[];
}

interface BacktestInput extends BacktestCommonInput {
  /** AI 策略的判斷來源；回測時必須是 inline */
  aiAdvisor?: AiAdvisor;
  /** 撮合週期以外的歷史 K 線，策略只拿得到當下已收盤的 */
  contextCandles?: Partial<Record<PionexKlineInterval, QuantCandleDto[]>>;
  /** 事件一產生就通知；回測中途中斷時，已發生的事件仍拿得到 */
  onEvent?: (event: BacktestEvent) => void;
  /** 合約才需要；有帶就以逐倉保證金模型回測 */
  futures?: FuturesBacktestMarket;
  type: QuantBotType;
}

export interface BacktestEvent {
  kind: string;
  payload?: Record<string, unknown>;
  time: number;
}

export interface BacktestResult {
  equity: { time: number; value: number }[];
  events: BacktestEvent[];
  fills: BotFill[];
  maxDrawdown: number;
  orders: SubmittedOrder[];
  pnl: number;
  returnRate: number;
  sharpe: number | null;
  stoppedReason: string | null;
  tradeCount: number;
  winRate: number | null;
}

// 同一根 K 線內的價格路徑：陽線先探低再拉高，陰線先衝高再回落
const pricePath = ({ close, high, low, open }: QuantCandleDto) =>
  close >= open ? [open, low, high, close] : [open, high, low, close];

const maxDrawdownOf = (values: number[]) => {
  let peak = -Infinity;
  let drawdown = 0;

  for (const value of values) {
    peak = Math.max(peak, value);
    if (peak > 0) drawdown = Math.max(drawdown, (peak - value) / peak);
  }

  return drawdown;
};

const sharpeOf = (equity: { time: number; value: number }[]) => {
  const daily = new Map<number, number>();
  for (const { time, value } of equity)
    daily.set(Math.floor(time / DAY_MS), value);

  const values = [...daily.values()];
  const returns = values
    .slice(1)
    .map((value, index) => value / values[index] - 1);
  if (returns.length < 2) return null;

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (returns.length - 1);
  const deviation = Math.sqrt(variance);

  return deviation > 0 ? (mean / deviation) * Math.sqrt(365) : null;
};

export const runBacktest = async (
  input: BacktestInput,
): Promise<BacktestResult> => {
  const { candles, config, interval, investment, spec } = input;
  const orders: SubmittedOrder[] = [];
  const fills: BotFill[] = [];
  const events: BacktestEvent[] = [];
  const closedPnls: number[] = [];
  let price: number | null = null;
  let now = candles[0]?.time ?? 0;
  let index = 0;
  let sequence = 0;
  let stoppedReason: string | null = null;
  let realized = 0;

  const { futures, type } = input;
  const isFutures = !!futures;
  const broker = new SimulatedBroker(
    { averagePrice: () => Promise.resolve(price), lastPrice: () => price },
    () => now,
    isFutures ? 'PERP' : 'SPOT',
  );
  const store: SessionStore = {
    insertFill: (fill) => Promise.resolve(void fills.push(fill)),
    insertFunding: ({ amount, rate, time }) =>
      Promise.resolve(
        void events.push({ kind: 'funding', payload: { amount, rate }, time }),
      ),
    insertOrder: (order) => Promise.resolve(void orders.push(order)),
    log: (kind, payload) => {
      const event = { kind, payload, time: now };
      events.push(event);
      input.onEvent?.(event);
    },
    nextClientOrderId: () => Promise.resolve(`backtest-${++sequence}`),
    setPaused: () => Promise.resolve(),
    setStopped: (reason) => Promise.resolve(void (stoppedReason = reason)),
    updateOrder: () => Promise.resolve(),
  };
  const common = {
    broker,
    candles: (requested: PionexKlineInterval, count: number) => {
      const context =
        requested === interval ? undefined : input.contextCandles?.[requested];

      return Promise.resolve(
        context
          ? context
              .filter(({ time }) => candleEndOf(requested, time) <= now)
              .slice(-count)
          : candles.slice(Math.max(0, index + 1 - count), index + 1),
      );
    },
    config,
    fills: [],
    investment,
    now: () => now,
    orders: [],
    spec,
  } satisfies Partial<SessionOptions>;

  const margin = isFutures ? futuresMarginOf({ config, type }) : null;
  const committed = investment + (margin?.extraMargin ?? 0);

  // 平倉成交才會改變已實現損益，用每次的變化量算勝率
  const trackRealized = (next: number) => {
    if (next !== realized) closedPnls.push(next - realized);
    realized = next;
  };

  const session: BotSession<Ledger> | BotSession<FuturesLedger> =
    futures && margin
      ? new BotSession<FuturesLedger>({
          ...common,
          account: new FuturesAccount({
            investment: committed,
            leverage: margin.leverage,
            liquidationFeeRate: futures.liquidationFeeRate,
            riskTiers: futures.riskTiers,
          }),
          createStrategy: (context) =>
            createFuturesStrategy(type, context, {
              advisor: input.aiAdvisor,
            }),
          store: {
            ...store,
            insertFill: async (fill) => {
              await store.insertFill(fill);
              trackRealized(session.ledger.realizedPnl);
            },
          },
        })
      : new BotSession<Ledger>({
          ...common,
          account: new SpotAccount(investment),
          createStrategy: (context) =>
            createStrategy(type, context, { advisor: input.aiAdvisor }),
          store: {
            ...store,
            insertFill: async (fill) => {
              await store.insertFill(fill);
              trackRealized(session.ledger.realizedPnl);
            },
          },
        });

  const fundingRates = futures?.fundingRates ?? [];
  let fundingIndex = 0;
  const equity: { time: number; value: number }[] = [];

  for (index = 0; index < candles.length; index++) {
    const candle = candles[index];
    const path = pricePath(candle);

    for (
      ;
      fundingIndex < fundingRates.length &&
      fundingRates[fundingIndex].time <= candle.time;
      fundingIndex++
    )
      if (index > 0) {
        const { rate, time } = fundingRates[fundingIndex];
        now = time;
        await session.handleFunding(rate, candle.open, time);
      }

    for (const [step, point] of path.entries()) {
      price = point;
      now =
        candle.time +
        ((candleEndOf(interval, candle.time) - candle.time) * step) /
          (path.length - 1);
      await session.handlePrice(point);
      // 歷史標記價格只能取到最近 2000 根，強平以成交價判斷，比交易所以標記價格判斷保守
      if (isFutures) await session.handleMark(point);
      if (index === 0 && step === 0) await session.start();
    }

    now = candleEndOf(interval, candle.time);
    await session.handleCandleClose(candle);
    equity.push({ time: candle.time, value: session.equity(candle.close) });
    if (session.isStopped) break;
  }

  const finalEquity = equity.at(-1)?.value ?? committed;

  return {
    equity,
    events,
    fills,
    maxDrawdown: maxDrawdownOf(equity.map(({ value }) => value)),
    orders,
    pnl: finalEquity - committed,
    returnRate: finalEquity / committed - 1,
    sharpe: sharpeOf(equity),
    stoppedReason,
    tradeCount: fills.length,
    winRate: closedPnls.length
      ? closedPnls.filter((pnl) => pnl > 0).length / closedPnls.length
      : null,
  };
};
