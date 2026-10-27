import type { DcaConfigDto } from '../../dto/quant-bot.dto.js';
import type { BotOrder, Strategy, StrategyContext } from '../types.js';

import { adverse, type Trader } from './trader.js';

// 標記格式 dca:<輪次>:<base|safety-N|tp|sl>，重啟後靠它還原輪次與加碼進度
const tagOf = (cycle: number, step: string) => `dca:${cycle}:${step}`;

const parseTag = (tag?: string) => {
  const match = tag?.match(/^dca:(\d+):(.+)$/);

  return match ? { cycle: Number(match[1]), step: match[2] } : null;
};

/** 第 n 筆加碼（從 1 起算）相對首單成交價的累計逆向幅度（%）：做多是跌幅、做空是漲幅 */
export const safetyDeviation = (
  { priceDeviation, stepScale }: DcaConfigDto,
  n: number,
) =>
  Array.from(
    { length: n },
    (_, index) => priceDeviation * stepScale ** index,
  ).reduce((sum, value) => sum + value, 0);

const safetyAmount = (
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

  constructor(
    private readonly context: StrategyContext<unknown>,
    private readonly trader: Trader,
  ) {
    this.config = context.config as DcaConfigDto;
  }

  async start() {
    if (this.context.openOrders().length) return;

    await this.openCycle(this.currentCycle() + 1);
  }

  async onPrice(price: number) {
    const { stopLoss } = this.config;
    const { direction } = this.trader;
    const { averageCost, size } = this.trader.holding();
    if (!stopLoss || size <= 0) return;

    if (
      adverse(
        direction,
        price,
        averageCost * (1 - (direction * stopLoss) / 100),
      )
    ) {
      await this.context.cancelAll();
      await this.trader.closeMarket(size, tagOf(this.currentCycle(), 'sl'));
      await this.context.stop('stop_loss');
    }
  }

  async onFill(order: BotOrder) {
    const parsed = parseTag(order.tag);
    if (!parsed || order.status !== 'filled') return;

    if (parsed.step === 'tp') return this.openCycle(parsed.cycle + 1);
    if (this.trader.isOpening(order))
      await this.rearm(parsed.cycle, parsed.step);
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
    const opened = await this.trader.openMarket({
      amount: this.config.baseOrderAmount,
      tag: tagOf(cycle, 'base'),
    });
    if (!opened) await this.context.stop('dca_base_order_failed');
  }

  // 每次加倉成交後：停利單依新均價重掛，並掛下一筆加碼
  private async rearm(cycle: number, step: string) {
    for (const order of this.context.openOrders())
      if (parseTag(order.tag)?.cycle === cycle)
        await this.context.cancelOrder(order.id);

    const { direction } = this.trader;
    const { averageCost, size } = this.trader.holding();
    await this.trader.closeLimit({
      price: averageCost * (1 + (direction * this.config.takeProfit) / 100),
      size,
      tag: tagOf(cycle, 'tp'),
    });

    const filledSafety =
      step === 'base' ? 0 : Number(step.slice('safety-'.length));
    const next = filledSafety + 1;
    if (next > this.config.maxSafetyOrders) return;

    const basePrice = this.basePrice(cycle);
    if (basePrice === null) return;

    const price =
      basePrice * (1 - (direction * safetyDeviation(this.config, next)) / 100);
    await this.trader.openLimit({
      price,
      size: safetyAmount(this.config, next) / price,
      tag: tagOf(cycle, `safety-${next}`),
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
