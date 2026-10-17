import type { DcaConfigDto } from '../../dto/quant-bot.dto';
import type { BotOrder, Strategy, StrategyContext } from '../types';

// 標記格式 dca:<輪次>:<base|safety-N|tp|sl>，重啟後靠它還原輪次與加碼進度
const tagOf = (cycle: number, step: string) => `dca:${cycle}:${step}`;

const parseTag = (tag?: string) => {
  const match = tag?.match(/^dca:(\d+):(.+)$/);

  return match ? { cycle: Number(match[1]), step: match[2] } : null;
};

/** 第 n 筆加碼（從 1 起算）相對首單成交價的累計跌幅（%） */
export const safetyDeviation = (
  { priceDeviation, stepScale }: DcaConfigDto,
  n: number,
) =>
  Array.from(
    { length: n },
    (_, index) => priceDeviation * stepScale ** index,
  ).reduce((sum, value) => sum + value, 0);

export const safetyAmount = (
  { safetyOrderAmount, volumeScale }: DcaConfigDto,
  n: number,
) => safetyOrderAmount * volumeScale ** (n - 1);

export const dcaMaxInvestment = (config: DcaConfigDto) =>
  config.baseOrderAmount +
  Array.from({ length: config.maxSafetyOrders }, (_, index) =>
    safetyAmount(config, index + 1),
  ).reduce((sum, value) => sum + value, 0);

export class DcaStrategy implements Strategy {
  private readonly config: DcaConfigDto;

  constructor(private readonly context: StrategyContext) {
    this.config = context.config as DcaConfigDto;
  }

  async start() {
    if (this.context.openOrders().length) return;

    await this.openCycle(this.currentCycle() + 1);
  }

  async onPrice(price: number) {
    const { stopLoss } = this.config;
    const { averageCost, position } = this.ledger();
    if (!stopLoss || position <= 0) return;

    if (price <= averageCost * (1 - stopLoss / 100)) {
      await this.context.cancelAll();
      await this.context.placeOrder({
        side: 'SELL',
        size: position,
        tag: tagOf(this.currentCycle(), 'sl'),
        type: 'MARKET',
      });
      await this.context.stop('stop_loss');
    }
  }

  async onFill(order: BotOrder) {
    const parsed = parseTag(order.tag);
    if (!parsed || order.status !== 'filled') return;

    if (parsed.step === 'tp') return this.openCycle(parsed.cycle + 1);
    if (order.side === 'BUY') await this.rearm(parsed.cycle, parsed.step);
  }

  private ledger() {
    return this.context.ledger();
  }

  private currentCycle() {
    const tags = [
      ...this.context.openOrders().map(({ tag }) => tag),
      ...this.context
        .fills()
        .map(({ orderId }) => this.context.findOrder(orderId)?.tag),
    ];

    return tags.reduce(
      (max, tag) => Math.max(max, parseTag(tag)?.cycle ?? 0),
      0,
    );
  }

  private async openCycle(cycle: number) {
    const bought = await this.context.placeOrder({
      amount: this.config.baseOrderAmount,
      side: 'BUY',
      tag: tagOf(cycle, 'base'),
      type: 'MARKET',
    });
    if (!bought) await this.context.stop('dca_base_order_failed');
  }

  // 每次買入成交後：停利單依新均價重掛，並掛下一筆加碼
  private async rearm(cycle: number, step: string) {
    for (const order of this.context.openOrders())
      if (parseTag(order.tag)?.cycle === cycle)
        await this.context.cancelOrder(order.id);

    const { averageCost, position } = this.ledger();
    await this.context.placeOrder({
      price: averageCost * (1 + this.config.takeProfit / 100),
      side: 'SELL',
      size: position,
      tag: tagOf(cycle, 'tp'),
      type: 'LIMIT',
    });

    const filledSafety =
      step === 'base' ? 0 : Number(step.slice('safety-'.length));
    const next = filledSafety + 1;
    if (next > this.config.maxSafetyOrders) return;

    const basePrice = this.basePrice(cycle);
    if (basePrice === null) return;

    const price = basePrice * (1 - safetyDeviation(this.config, next) / 100);
    await this.context.placeOrder({
      price,
      side: 'BUY',
      size: safetyAmount(this.config, next) / price,
      tag: tagOf(cycle, `safety-${next}`),
      type: 'LIMIT',
    });
  }

  private basePrice(cycle: number) {
    const fill = this.context
      .fills()
      .find(
        ({ orderId }) =>
          this.context.findOrder(orderId)?.tag === tagOf(cycle, 'base'),
      );

    return fill?.price ?? null;
  }
}
