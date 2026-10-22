import type { QuantCandleDto } from '../../dto/quant-market.dto.js';

import { runBacktest } from '../backtest.js';
import { LedgerBook } from '../ledger.js';
import type { BotFill, SymbolSpec } from '../types.js';

import { dcaMaxInvestment, safetyDeviation } from './dca.strategy.js';
import { gridLayout, gridLines, gridQuantity } from './grid.strategy.js';

// 全部在記憶體裡以模擬撮合回測，不連交易所、不下任何真實委託

const spot: SymbolSpec = {
  amountPrecision: 2,
  base: 'BTC',
  maxTradeSize: 1_000,
  minAmount: 1,
  minTradeSize: 0.0001,
  pricePrecision: 2,
  quote: 'USDT',
  sizePrecision: 4,
  symbol: 'BTC_USDT',
};

const perp: SymbolSpec = { ...spot, symbol: 'BTC_USDT_PERP' };

const MINUTE = 60_000;

const candlesOf = (closes: number[], start = 100): QuantCandleDto[] =>
  closes.map((close, index) => {
    const open = index === 0 ? start : closes[index - 1];

    return {
      close,
      high: Math.max(open, close),
      low: Math.min(open, close),
      open,
      time: index * MINUTE,
      volume: 1,
    };
  });

const oscillate = (cycles: number, low: number, high: number) =>
  Array.from({ length: cycles }, () => [low, high]).flat();

const ledgerTrail = (investment: number, fills: BotFill[]) => {
  const book = new LedgerBook(investment);

  return fills.map((fill) => {
    book.apply(fill);
    return book.snapshot();
  });
};

const gridConfig = {
  bottom: 90,
  closeModel: 'NOT_SELL' as const,
  gridType: 'arithmetic' as const,
  row: 10,
  top: 110,
};

describe('網格參數', () => {
  it('等差與等比格線的端點與格數', () => {
    expect(gridLines({ ...gridConfig, row: 4 })).toEqual([
      90, 95, 100, 105, 110,
    ]);

    const geometric = gridLines({
      bottom: 100,
      gridType: 'geometric',
      row: 2,
      top: 400,
    });
    expect(geometric[1]).toBeCloseTo(200, 10);
  });

  it('最靠近現價的格線不掛單，其餘依現價分買賣', () => {
    const { buys, sells } = gridLayout(gridLines(gridConfig), 100.4);

    expect(buys.map(({ line }) => line)).toEqual([90, 92, 94, 96, 98]);
    expect(sells.map(({ line }) => line)).toEqual([102, 104, 106, 108, 110]);
  });

  it('每格數量讓買單區加上開倉買入的總金額剛好等於投入', () => {
    const lines = gridLines(gridConfig);
    const quantity = gridQuantity(lines, 100, 1000);
    const { buys, sells } = gridLayout(lines, 100);

    expect(
      buys.reduce((sum, { line }) => sum + line * quantity, 0) +
        sells.length * 100 * quantity,
    ).toBeCloseTo(1000, 6);
  });
});

describe('現貨網格（模擬回測）', () => {
  it('來回震盪會賺到價差，且資金與部位始終不為負', async () => {
    const result = await runBacktest({
      candles: candlesOf(oscillate(20, 95, 105)),
      config: gridConfig,
      interval: '1M',
      investment: 1000,
      spec: spot,
      type: 'grid',
    });

    const trail = ledgerTrail(1000, result.fills);
    expect(result.tradeCount).toBeGreaterThan(10);
    expect(trail.at(-1)!.realizedPnl).toBeGreaterThan(0);
    for (const ledger of trail) {
      expect(ledger.quoteBalance).toBeGreaterThanOrEqual(-1e-6);
      expect(ledger.position).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(result.events.map(({ kind }) => kind)).not.toContain(
      'order_rejected',
    );
  });

  it('跌破停損價就停止並撤掉所有掛單', async () => {
    const result = await runBacktest({
      candles: candlesOf([99, 96, 93, 90, 86, 84, 83]),
      config: { ...gridConfig, lossStop: { type: 'price', value: 85 } },
      interval: '1M',
      investment: 1000,
      spec: spot,
      type: 'grid',
    });

    expect(result.stoppedReason).toBe('loss_stop');
    expect(result.orders.filter(({ status }) => status === 'open')).toEqual([]);
  });

  it('停止時選擇賣回計價幣，部位會被市價清空', async () => {
    const result = await runBacktest({
      candles: candlesOf([99, 96, 93, 90, 86, 84]),
      config: {
        ...gridConfig,
        closeModel: 'TO_QUOTE',
        lossStop: { type: 'price', value: 85 },
      },
      interval: '1M',
      investment: 1000,
      spec: spot,
      type: 'grid',
    });

    expect(result.stoppedReason).toBe('loss_stop');
    expect(ledgerTrail(1000, result.fills).at(-1)!.position).toBeCloseTo(0, 3);
  });
});

const dcaConfig = {
  baseOrderAmount: 100,
  maxSafetyOrders: 3,
  priceDeviation: 2,
  safetyOrderAmount: 100,
  stepScale: 1.5,
  takeProfit: 1.5,
  volumeScale: 2,
};

describe('DCA（模擬回測）', () => {
  it('加碼價位依偏離幅度遞增，總投入不超過設定上限', async () => {
    expect([1, 2, 3].map((n) => safetyDeviation(dcaConfig, n))).toEqual([
      2, 5, 9.5,
    ]);

    // 投入給得比上限多，確認是策略自己停在最多 3 筆加碼，而不是被餘額擋下
    const result = await runBacktest({
      candles: candlesOf([99, 97, 95, 92, 89, 85, 80, 70]),
      config: dcaConfig,
      interval: '1M',
      investment: dcaMaxInvestment(dcaConfig) * 10,
      spec: spot,
      type: 'dca',
    });

    const spent = result.fills
      .filter(({ side }) => side === 'BUY')
      .reduce((sum, { price, size }) => sum + price * size, 0);
    expect(spent).toBeLessThanOrEqual(dcaMaxInvestment(dcaConfig) + 1e-6);
    expect(
      result.orders.filter(({ tag }) => tag?.includes('safety')).length,
    ).toBe(3);
  });

  it('反彈到停利價會出場獲利並開下一輪', async () => {
    const result = await runBacktest({
      candles: candlesOf([99, 97.5, 99, 101, 103]),
      config: dcaConfig,
      interval: '1M',
      investment: dcaMaxInvestment(dcaConfig),
      spec: spot,
      type: 'dca',
    });

    const tags = result.orders
      .filter(({ status }) => status === 'filled')
      .map(({ tag }) => tag);
    expect(tags).toContain('dca:1:tp');
    expect(tags).toContain('dca:2:base');
    expect(ledgerTrail(1000, result.fills).at(-1)!.realizedPnl).toBeGreaterThan(
      0,
    );
  });

  it('跌破停損就平倉並停止', async () => {
    const result = await runBacktest({
      candles: candlesOf([99, 97, 94, 90, 85, 80, 75]),
      config: { ...dcaConfig, stopLoss: 10 },
      interval: '1M',
      investment: dcaMaxInvestment(dcaConfig),
      spec: spot,
      type: 'dca',
    });

    expect(result.stoppedReason).toBe('stop_loss');
    expect(ledgerTrail(1000, result.fills).at(-1)!.position).toBeCloseTo(0, 3);
  });
});

describe('合約網格（模擬回測，逐倉）', () => {
  const futures = {
    fundingRates: [],
    liquidationFeeRate: 0.005,
    riskTiers: [
      { maintMarginRatio: 0.005, notionalLimit: 1_000_000, quickDeduction: 0 },
    ],
  };

  it('高槓桿做多遇到單邊下跌會被強平，虧損不超過投入的保證金', async () => {
    const result = await runBacktest({
      candles: candlesOf([98, 95, 92, 89, 86, 83, 80, 76, 72, 68, 64, 60]),
      config: {
        ...gridConfig,
        bottom: 80,
        leverage: 20,
        top: 120,
        trend: 'long',
      },
      futures,
      interval: '1M',
      investment: 1000,
      spec: perp,
      type: 'futures_grid',
    });

    expect(result.stoppedReason).toBe('liquidated');
    expect(result.pnl).toBeGreaterThanOrEqual(-1000 - 1e-6);
    expect(result.equity.at(-1)!.value).toBeGreaterThanOrEqual(-1e-6);
  });

  it('低槓桿在區間內震盪不會被強平', async () => {
    const result = await runBacktest({
      candles: candlesOf(oscillate(15, 95, 105)),
      config: { ...gridConfig, leverage: 2, trend: 'no_trend' },
      futures,
      interval: '1M',
      investment: 1000,
      spec: perp,
      type: 'futures_grid',
    });

    expect(result.stoppedReason).toBeNull();
    expect(result.tradeCount).toBeGreaterThan(0);
  });
});
