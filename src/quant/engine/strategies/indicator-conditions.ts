import { BollingerBands, EMA, MACD, RSI, SMA } from 'technicalindicators';

import type { IndicatorConditionDto } from '../../dto/quant-bot.dto.js';

const DEFAULT_RSI_PERIOD = 14;
const DEFAULT_BOLLINGER = { period: 20, stdDev: 2 };
const DEFAULT_MACD = { fast: 12, signal: 9, slow: 26 };

const crossed = (
  [previousFast, fast]: number[],
  [previousSlow, slow]: number[],
  direction: 'golden' | 'death',
) =>
  direction === 'golden'
    ? previousFast <= previousSlow && fast > slow
    : previousFast >= previousSlow && fast < slow;

const lastTwo = (values: (number | undefined)[]) =>
  values.slice(-2).filter((value): value is number => value !== undefined);

export const isConditionComplete = (
  condition: IndicatorConditionDto,
): boolean => {
  switch (condition.kind) {
    case 'rsi':
      return condition.operator != null && condition.value != null;
    case 'maCross':
    case 'emaCross':
      return (
        condition.fast != null &&
        condition.slow != null &&
        condition.fast < condition.slow &&
        condition.direction != null
      );
    case 'macdCross':
      return condition.direction != null;
    case 'bollinger':
      return condition.band != null;
  }
};

// 只看已收盤的 K 線，避免訊號在同一根 K 線內反覆出現又消失
export const conditionMet = (
  condition: IndicatorConditionDto,
  closes: number[],
): boolean => {
  switch (condition.kind) {
    case 'rsi': {
      const [value] = RSI.calculate({
        period: condition.period ?? DEFAULT_RSI_PERIOD,
        values: closes,
      }).slice(-1);
      if (value === undefined || condition.value === undefined) return false;

      return condition.operator === 'below'
        ? value < condition.value
        : value > condition.value;
    }
    case 'maCross':
    case 'emaCross': {
      const average = condition.kind === 'maCross' ? SMA : EMA;
      const fast = lastTwo(
        average.calculate({ period: condition.fast ?? 7, values: closes }),
      );
      const slow = lastTwo(
        average.calculate({ period: condition.slow ?? 25, values: closes }),
      );
      if (fast.length < 2 || slow.length < 2) return false;

      return crossed(fast, slow, condition.direction ?? 'golden');
    }
    case 'macdCross': {
      const result = MACD.calculate({
        fastPeriod: condition.fast ?? DEFAULT_MACD.fast,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
        signalPeriod: condition.period ?? DEFAULT_MACD.signal,
        slowPeriod: condition.slow ?? DEFAULT_MACD.slow,
        values: closes,
      });
      const macd = lastTwo(result.map(({ MACD: value }) => value));
      const signal = lastTwo(result.map(({ signal: value }) => value));
      if (macd.length < 2 || signal.length < 2) return false;

      return crossed(macd, signal, condition.direction ?? 'golden');
    }
    case 'bollinger': {
      const [band] = BollingerBands.calculate({
        period: condition.period ?? DEFAULT_BOLLINGER.period,
        stdDev: condition.stdDev ?? DEFAULT_BOLLINGER.stdDev,
        values: closes,
      }).slice(-1);
      const close = closes.at(-1);
      if (!band || close === undefined) return false;

      return condition.band === 'upper'
        ? close > band.upper
        : close < band.lower;
    }
  }
};

export const requiredCandles = (conditions: IndicatorConditionDto[]) =>
  Math.max(
    50,
    ...conditions.map(
      ({ period = 0, slow = 0 }) => Math.max(period, slow) * 3 + 10,
    ),
  );
