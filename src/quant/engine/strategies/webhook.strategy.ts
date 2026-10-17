import type { WebhookConfigDto } from '../../dto/quant-bot.dto';
import type { Strategy, StrategyContext, WebhookSignal } from '../types';

export class WebhookStrategy implements Strategy {
  private readonly config: WebhookConfigDto;

  constructor(private readonly context: StrategyContext) {
    this.config = context.config as WebhookConfigDto;
  }

  start() {
    return Promise.resolve();
  }

  async onSignal({ action, amount }: WebhookSignal) {
    const { position, quoteBalance } = this.context.ledger();

    if (action === 'buy') {
      await this.context.placeOrder({
        amount: Math.min(amount ?? this.config.orderAmount, quoteBalance),
        side: 'BUY',
        tag: 'webhook:buy',
        type: 'MARKET',
      });
      return;
    }

    const price = this.context.lastPrice();
    const size =
      action === 'sell' && amount !== undefined && price
        ? Math.min(amount / price, position)
        : position;

    await this.context.placeOrder({
      side: 'SELL',
      size,
      tag: `webhook:${action}`,
      type: 'MARKET',
    });
  }
}
