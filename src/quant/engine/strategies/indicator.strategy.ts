import type { IndicatorConfigDto } from '../../dto/quant-bot.dto.js';
import type { QuantCandleDto } from '../../dto/quant-market.dto.js';
import type { Strategy, StrategyContext } from '../types.js';

import { conditionMet, requiredCandles } from './indicator-conditions.js';
import { adverse, favorable, type Trader } from './trader.js';

export class IndicatorStrategy implements Strategy {
  private readonly config: IndicatorConfigDto;

  constructor(
    private readonly context: StrategyContext<unknown>,
    private readonly trader: Trader,
  ) {
    this.config = context.config as IndicatorConfigDto;
  }

  start() {
    return Promise.resolve();
  }

  async onCandleClose(candle: QuantCandleDto) {
    const { entry, exit, interval, orderAmount } = this.config;
    const candles = await this.context.candles(
      interval,
      requiredCandles([...entry, ...exit]),
    );
    const closes = candles
      .filter(({ time }) => time <= candle.time)
      .map(({ close }) => close);

    if (this.holding(candle.close)) {
      if (exit.some((condition) => conditionMet(condition, closes)))
        await this.closePosition('exit_signal');
      return;
    }

    if (entry.every((condition) => conditionMet(condition, closes)))
      await this.trader.openMarket({
        amount: Math.min(orderAmount, this.trader.budget()),
        tag: 'indicator:entry',
      });
  }

  async onPrice(price: number) {
    const { stopLoss, takeProfit } = this.config;
    const { direction } = this.trader;
    const { averageCost } = this.trader.holding();
    if (!this.holding(price)) return;

    if (
      takeProfit &&
      favorable(
        direction,
        price,
        averageCost * (1 + (direction * takeProfit) / 100),
      )
    )
      await this.closePosition('take_profit');
    else if (
      stopLoss &&
      adverse(
        direction,
        price,
        averageCost * (1 - (direction * stopLoss) / 100),
      )
    )
      await this.closePosition('stop_loss');
  }

  // 平不掉的零頭（低於交易所最小單）不算持倉
  private holding(price: number) {
    const { size } = this.trader.holding();
    const { minAmount, minTradeSize } = this.context.spec;

    return size >= minTradeSize && size * price >= minAmount;
  }

  private async closePosition(reason: string) {
    this.context.log('exit', { reason });
    await this.trader.closeMarket(
      this.trader.holding().size,
      `indicator:${reason}`,
    );
  }
}
