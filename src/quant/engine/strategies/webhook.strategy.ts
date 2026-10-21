import type { WebhookConfigDto } from '../../dto/quant-bot.dto.js';
import type { Strategy, StrategyContext, WebhookSignal } from '../types.js';

import type { Trader } from './trader.js';

// 做多時 buy 開倉、sell 減倉；做空時相反，和 TradingView 單向策略的語意一致
export class WebhookStrategy implements Strategy {
  private readonly config: WebhookConfigDto;

  constructor(
    private readonly context: StrategyContext<unknown>,
    private readonly trader: Trader,
  ) {
    this.config = context.config as WebhookConfigDto;
  }

  start() {
    return Promise.resolve();
  }

  async onSignal({ action, amount }: WebhookSignal) {
    const opening = this.trader.direction > 0 ? 'buy' : 'sell';

    if (action === opening) {
      await this.trader.openMarket({
        amount: Math.min(
          amount ?? this.config.orderAmount,
          this.trader.budget(),
        ),
        tag: `webhook:${action}`,
      });
      return;
    }

    const { size: holding } = this.trader.holding();
    const price = this.context.lastPrice();
    const size =
      action !== 'close' && amount !== undefined && price
        ? Math.min(amount / price, holding)
        : holding;

    await this.trader.closeMarket(size, `webhook:${action}`);
  }
}
