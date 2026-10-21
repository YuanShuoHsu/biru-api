import type {
  FuturesGridConfigDto,
  FuturesGridStopDto,
} from '../../dto/quant-bot.dto.js';
import { PIONEX_FEE_RATES } from '../fee-rates.js';
import type { FuturesLedger } from '../futures-account.js';
import type { BotOrder, Strategy, StrategyContext } from '../types.js';

import { gridLayout, gridLines, stopAmount } from './grid.strategy.js';

const LEVEL_TAG = 'grid:';
// 限價停損停利觸發後掛出的平倉單，tag 帶停止原因，重啟後也認得出來
const STOP_TAG = 'stop:';
// 開倉市價單可能吃到比現價差的檔位，預留這個比例的滑價，免得最後幾格保證金不足
const OPEN_SLIPPAGE_BUFFER = 0.005;

const levelOf = ({ tag }: BotOrder) =>
  tag?.startsWith(LEVEL_TAG) ? Number(tag.slice(LEVEL_TAG.length)) : null;

/**
 * 每格同樣數量：做多先以現價買進上方各格的部位、做空先賣出下方各格的部位，
 * 中性不開倉、兩邊掛單都要占保證金。保證金加上開倉手續費不超過投入金額。
 */
export const futuresGridQuantity = (
  config: Pick<FuturesGridConfigDto, 'leverage' | 'trend'> & {
    lines: number[];
  },
  price: number,
  investment: number,
) => {
  const { buys, sells } = gridLayout(config.lines, price);
  const sum = (levels: { line: number }[]) =>
    levels.reduce((total, { line }) => total + line, 0);
  const openPrice = price * (1 + OPEN_SLIPPAGE_BUFFER);
  const notional =
    config.trend === 'long'
      ? sells.length * openPrice + sum(buys)
      : config.trend === 'short'
        ? buys.length * openPrice + sum(sells)
        : sum(buys) + sum(sells);

  return (
    investment /
    (notional / config.leverage + notional * PIONEX_FEE_RATES.PERP.taker)
  );
};

export class FuturesGridStrategy implements Strategy {
  private readonly config: FuturesGridConfigDto;
  private readonly lines: number[];
  private triggered: boolean;

  constructor(private readonly context: StrategyContext<FuturesLedger>) {
    this.config = context.config as FuturesGridConfigDto;
    this.lines = gridLines(this.config);
    this.triggered = !this.config.trigger;
  }

  async start() {
    if (this.context.fills().length || this.context.openOrders().length) {
      this.triggered = true;
      return;
    }

    const price = this.context.lastPrice();
    if (price !== null) await this.onPrice(price);
  }

  async onPrice(price: number) {
    if (!this.triggered) {
      const { direction, price: trigger } = this.config.trigger!;
      if (direction === 'above' ? price < trigger : price > trigger) return;

      this.triggered = true;
      this.context.log('triggered', { price });
    }

    const openOrders = this.context.openOrders();
    if (openOrders.some(({ tag }) => tag?.startsWith(STOP_TAG))) return;
    if (!this.context.fills().length && !openOrders.length)
      return this.layout(price);

    await this.checkStops(price);
  }

  async onFill(order: BotOrder) {
    if (order.tag?.startsWith(STOP_TAG)) {
      if (order.status === 'filled')
        await this.context.stop(order.tag.slice(STOP_TAG.length));
      return;
    }

    const level = levelOf(order);
    if (level === null || order.status !== 'filled' || !order.size) return;

    const next = order.side === 'BUY' ? level + 1 : level - 1;
    const line = this.lines[next];
    if (line === undefined) return;

    await this.context.placeOrder({
      price: line,
      side: order.side === 'BUY' ? 'SELL' : 'BUY',
      size: order.size,
      tag: `${LEVEL_TAG}${next}`,
      type: 'LIMIT',
    });
  }

  // Pionex 合約網格停止時一律平倉
  async stop() {
    const { position } = this.context.ledger();
    if (position !== 0)
      await this.context.placeOrder({
        side: position > 0 ? 'SELL' : 'BUY',
        size: Math.abs(position),
        tag: 'grid:close',
        type: 'MARKET',
      });
  }

  private async layout(price: number) {
    const { trend } = this.config;
    const quantity = futuresGridQuantity(
      { ...this.config, lines: this.lines },
      price,
      this.context.investment,
    );
    const { buys, sells } = gridLayout(this.lines, price);
    const opening =
      trend === 'long' ? sells.length : trend === 'short' ? buys.length : 0;

    if (opening) {
      const opened = await this.context.placeOrder({
        side: trend === 'long' ? 'BUY' : 'SELL',
        size: quantity * opening,
        tag: 'grid:open',
        type: 'MARKET',
      });
      if (!opened) return this.context.stop('grid_open_failed');
    }

    for (const { index, line } of sells)
      await this.context.placeOrder({
        price: line,
        side: 'SELL',
        size: quantity,
        tag: `${LEVEL_TAG}${index}`,
        type: 'LIMIT',
      });

    for (const { index, line } of buys)
      await this.context.placeOrder({
        price: line,
        side: 'BUY',
        size: quantity,
        tag: `${LEVEL_TAG}${index}`,
        type: 'LIMIT',
      });

    this.context.log('grid_started', { price, quantity });
  }

  /** 限價停損停利：撤掉網格單、掛限價平倉，成交後才停止；其餘方式直接市價平倉 */
  private async close(reason: string, limitPrice?: number) {
    const { position } = this.context.ledger();
    if (!limitPrice || position === 0) return this.context.stop(reason);

    await this.context.cancelAll();
    const order = await this.context.placeOrder({
      price: limitPrice,
      side: position > 0 ? 'SELL' : 'BUY',
      size: Math.abs(position),
      tag: `${STOP_TAG}${reason}`,
      type: 'LIMIT',
    });
    if (!order) return this.context.stop(reason);
  }

  private async checkStops(price: number) {
    const { lossStop, lossStopHigh, lossStopLimitHigh, profitStop, trend } =
      this.config;
    const { entryPrice, marginBalance, position } = this.context.ledger();
    const pnl =
      marginBalance +
      position * (price - entryPrice) -
      this.context.investment -
      (this.config.extraMargin ?? 0);
    const threshold = stopAmount(
      this.context.investment + (this.config.extraMargin ?? 0),
    );
    // 做空的停損在上方、停利在下方，做多與中性相反
    const lossHit = (stop: number) =>
      trend === 'short' ? price >= stop : price <= stop;

    const isPrice = ({ type }: FuturesGridStopDto) =>
      type === 'price' || type === 'price_limit';
    const isLimit = lossStop?.type === 'price_limit';

    if (
      lossStop &&
      (isPrice(lossStop)
        ? lossHit(lossStop.value)
        : -pnl >= threshold(lossStop))
    )
      return this.close('loss_stop', isLimit ? lossStop.limitPrice : undefined);

    if (trend === 'no_trend' && lossStopHigh && price >= lossStopHigh)
      return this.close('loss_stop', isLimit ? lossStopLimitHigh : undefined);

    if (
      profitStop &&
      (isPrice(profitStop)
        ? trend === 'short'
          ? price <= profitStop.value
          : price >= profitStop.value
        : pnl >= threshold(profitStop))
    )
      return this.close(
        'profit_stop',
        profitStop.type === 'price_limit' ? profitStop.limitPrice : undefined,
      );
  }
}
