import type {
  FuturesGridStopDto,
  GridConfigDto,
} from '../../dto/quant-bot.dto.js';
import type { BotFill, BotOrder, Strategy, StrategyContext } from '../types.js';

const LEVEL_TAG = 'grid:';

export const gridLines = ({
  bottom,
  gridType,
  row,
  top,
}: Pick<GridConfigDto, 'bottom' | 'gridType' | 'row' | 'top'>) =>
  Array.from({ length: row + 1 }, (_, index) =>
    gridType === 'arithmetic'
      ? bottom + ((top - bottom) * index) / row
      : bottom * (top / bottom) ** (index / row),
  );

/** 金額或比例型停損停利換算成計價幣金額；比例相對投入，與 Pionex 相同 */
export const stopAmount =
  (investment: number) =>
  ({ type, value }: Pick<FuturesGridStopDto, 'type' | 'value'>) =>
    type === 'profit_ratio' ? (investment * value) / 100 : value;

const levelOf = ({ tag }: BotOrder) =>
  tag?.startsWith(LEVEL_TAG) ? Number(tag.slice(LEVEL_TAG.length)) : null;

// 最靠近現價的格線先不掛單，留給第一筆成交後的反向單，否則會與既有掛單重複
export const gridLayout = (lines: number[], price: number) => {
  const skipped = lines.reduce(
    (nearest, line, index) =>
      Math.abs(line - price) < Math.abs(lines[nearest] - price)
        ? index
        : nearest,
    0,
  );
  const levels = lines.map((line, index) => ({ index, line }));

  return {
    buys: levels.filter(({ index, line }) => index !== skipped && line < price),
    sells: levels.filter(
      ({ index, line }) => index !== skipped && line > price,
    ),
  };
};

// 每格同樣的基礎幣數量：買單區用各格價格計價，賣單區要先以現價買入
export const gridQuantity = (
  lines: number[],
  price: number,
  investment: number,
) => {
  const { buys, sells } = gridLayout(lines, price);
  const buyCost = buys.reduce((sum, { line }) => sum + line, 0);

  return investment / (buyCost + sells.length * price);
};

export class GridStrategy implements Strategy {
  private readonly config: GridConfigDto;
  private readonly lines: number[];
  private triggered: boolean;

  constructor(private readonly context: StrategyContext) {
    this.config = context.config as GridConfigDto;
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

    if (!this.context.fills().length && !this.context.openOrders().length)
      return this.layout(price);

    await this.checkStops(price);
  }

  async onFill(order: BotOrder) {
    const level = levelOf(order);
    if (level === null || order.status !== 'filled' || !order.size) return;

    const next = order.side === 'BUY' ? level + 1 : level - 1;
    const line = this.lines[next];
    if (line === undefined) return;

    await this.context.placeOrder({
      price: line,
      side: order.side === 'BUY' ? 'SELL' : 'BUY',
      size: order.side === 'BUY' ? this.sellableSize(order) : order.size,
      tag: `${LEVEL_TAG}${next}`,
      type: 'LIMIT',
    });
  }

  async stop(closeModel = this.config.closeModel) {
    if (closeModel !== 'TO_QUOTE') return;

    const { position } = this.context.ledger();
    if (position > 0)
      await this.context.placeOrder({
        side: 'SELL',
        size: position,
        tag: 'grid:close',
        type: 'MARKET',
      });
  }

  // 買入的手續費扣基礎幣，反向賣單只能賣實際收到的數量
  private sellableSize(order: BotOrder) {
    const fees = this.context
      .fills()
      .filter(
        (fill: BotFill) =>
          fill.orderId === order.id && fill.feeAsset === 'base',
      )
      .reduce((sum, { fee }) => sum + fee, 0);

    return (order.size ?? 0) - fees;
  }

  private async layout(price: number) {
    const quantity = gridQuantity(this.lines, price, this.context.investment);
    const { buys, sells: sellLevels } = gridLayout(this.lines, price);

    if (sellLevels.length) {
      const bought = await this.context.placeOrder({
        amount: quantity * sellLevels.length * price,
        side: 'BUY',
        tag: 'grid:open',
        type: 'MARKET',
      });
      if (!bought) return this.context.stop('grid_open_failed');
    }

    const perLevel =
      sellLevels.length && this.context.fills().length
        ? this.context.ledger().position / sellLevels.length
        : quantity;

    for (const { index, line } of sellLevels)
      await this.context.placeOrder({
        price: line,
        side: 'SELL',
        size: perLevel,
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

  private async checkStops(price: number) {
    const { lossStop, profitStop } = this.config;
    const ledger = this.context.ledger();
    const pnl =
      ledger.quoteBalance + ledger.position * price - this.context.investment;
    const threshold = stopAmount(this.context.investment);

    if (
      lossStop &&
      (lossStop.type === 'price'
        ? price <= lossStop.value
        : -pnl >= threshold(lossStop))
    )
      return this.context.stop('loss_stop');

    if (
      profitStop &&
      (profitStop.type === 'price'
        ? price >= profitStop.value
        : ledger.realizedPnl >= threshold(profitStop))
    )
      return this.context.stop('profit_stop');
  }
}
