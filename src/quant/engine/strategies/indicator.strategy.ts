import type { IndicatorConfigDto } from '../../dto/quant-bot.dto';
import type { QuantCandleDto } from '../../dto/quant-market.dto';
import type { Strategy, StrategyContext } from '../types';

import { conditionMet, requiredCandles } from './indicator-conditions';

export class IndicatorStrategy implements Strategy {
  private readonly config: IndicatorConfigDto;

  constructor(private readonly context: StrategyContext) {
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
      await this.context.placeOrder({
        amount: Math.min(orderAmount, this.ledger().quoteBalance),
        side: 'BUY',
        tag: 'indicator:entry',
        type: 'MARKET',
      });
  }

  async onPrice(price: number) {
    const { stopLoss, takeProfit } = this.config;
    const { averageCost } = this.ledger();
    if (!this.holding(price)) return;

    if (takeProfit && price >= averageCost * (1 + takeProfit / 100))
      await this.closePosition('take_profit');
    else if (stopLoss && price <= averageCost * (1 - stopLoss / 100))
      await this.closePosition('stop_loss');
  }

  private ledger() {
    return this.context.ledger();
  }

  // 賣不掉的零頭（低於交易所最小單）不算持倉
  private holding(price: number) {
    const { position } = this.ledger();
    const { minAmount, minTradeSize } = this.context.spec;

    return position >= minTradeSize && position * price >= minAmount;
  }

  private async closePosition(reason: string) {
    this.context.log('exit', { reason });
    await this.context.placeOrder({
      side: 'SELL',
      size: this.ledger().position,
      tag: `indicator:${reason}`,
      type: 'MARKET',
    });
  }
}
