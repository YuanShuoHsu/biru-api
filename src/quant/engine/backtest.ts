import type { QuantBotType } from '../dto/quant-bot.dto';
import type { QuantCandleDto } from '../dto/quant-market.dto';
import {
  PIONEX_KLINE_INTERVAL_MS,
  type PionexKlineInterval,
} from '../pionex/pionex.types';

import { BotSession, type SubmittedOrder } from './bot-session';
import { buildLedger, equityOf, realizedPerSell } from './ledger';
import { SimulatedBroker } from './simulated-broker';
import { createStrategy } from './strategies';
import type { BotFill, SymbolSpec } from './types';

const DAY_MS = 86_400_000;

export interface BacktestInput {
  candles: QuantCandleDto[];
  config: unknown;
  feeRate: number;
  interval: PionexKlineInterval;
  investment: number;
  spec: SymbolSpec;
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

export const runBacktest = async ({
  candles,
  config,
  feeRate,
  interval,
  investment,
  spec,
  type,
}: BacktestInput): Promise<BacktestResult> => {
  const intervalMs = PIONEX_KLINE_INTERVAL_MS[interval];
  const orders: SubmittedOrder[] = [];
  const fills: BotFill[] = [];
  const events: BacktestEvent[] = [];
  let price: number | null = null;
  let now = candles[0]?.time ?? 0;
  let index = 0;
  let sequence = 0;
  let stoppedReason: string | null = null;

  const broker = new SimulatedBroker(
    feeRate,
    { averagePrice: () => Promise.resolve(price), lastPrice: () => price },
    () => now,
  );

  const session = new BotSession({
    broker,
    candles: (_, count) =>
      Promise.resolve(candles.slice(Math.max(0, index + 1 - count), index + 1)),
    config,
    createStrategy: (context) => createStrategy(type, context),
    fills: [],
    investment,
    now: () => now,
    orders: [],
    spec,
    store: {
      insertFill: (fill) => Promise.resolve(void fills.push(fill)),
      insertOrder: (order) => Promise.resolve(void orders.push(order)),
      log: (kind, payload) => void events.push({ kind, payload, time: now }),
      nextClientOrderId: () => Promise.resolve(`backtest-${++sequence}`),
      setStopped: (reason) => Promise.resolve(void (stoppedReason = reason)),
      updateOrder: () => Promise.resolve(),
    },
  });

  const equity: { time: number; value: number }[] = [];

  for (index = 0; index < candles.length; index++) {
    const candle = candles[index];
    const path = pricePath(candle);

    for (const [step, point] of path.entries()) {
      price = point;
      now = candle.time + (intervalMs * step) / (path.length - 1);
      await session.handlePrice(point);
      if (index === 0 && step === 0) await session.start();
    }

    now = candle.time + intervalMs;
    await session.handleCandleClose(candle);
    equity.push({
      time: candle.time,
      value: equityOf(buildLedger(investment, fills), candle.close),
    });
    if (session.isStopped) break;
  }

  const finalEquity = equity.at(-1)?.value ?? investment;
  const sells = realizedPerSell(investment, fills);

  return {
    equity,
    events,
    fills,
    maxDrawdown: maxDrawdownOf(equity.map(({ value }) => value)),
    orders,
    pnl: finalEquity - investment,
    returnRate: finalEquity / investment - 1,
    sharpe: sharpeOf(equity),
    stoppedReason,
    tradeCount: fills.length,
    winRate: sells.length
      ? sells.filter((pnl) => pnl > 0).length / sells.length
      : null,
  };
};
