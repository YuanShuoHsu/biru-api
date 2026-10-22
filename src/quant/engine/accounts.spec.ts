import { SpotAccount } from './account.js';
import type { SubmittedOrder } from './bot-session.js';
import { FuturesAccount, type RiskTier } from './futures-account.js';
import { LedgerBook } from './ledger.js';
import { floorTo, roundTo, toDecimalString } from './precision.js';
import type { BotFill } from './types.js';

const fill = (overrides: Partial<BotFill>): BotFill => ({
  fee: 0,
  feeAsset: 'quote',
  orderId: 'o',
  price: 100,
  side: 'BUY',
  size: 1,
  time: 0,
  ...overrides,
});

const openOrder = (overrides: Partial<SubmittedOrder>): SubmittedOrder => ({
  clientOrderId: 'c',
  filledAmount: 0,
  filledSize: 0,
  id: 'o',
  side: 'BUY',
  status: 'open',
  type: 'LIMIT',
  ...overrides,
});

describe('精度', () => {
  it('浮點誤差不會讓數量少掉一個最小單位', () => {
    expect(0.29 * 100).toBeLessThan(29);
    expect(floorTo(0.29, 2)).toBe(0.29);
    expect(floorTo(0.123456, 4)).toBe(0.1234);
  });

  it('價格四捨五入不受浮點誤差影響', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(100.004, 2)).toBe(100);
  });

  it.each([
    [0.1 + 0.2, 8, '0.3'],
    [5, 2, '5'],
    [0.0000001, 8, '0.0000001'],
    [1234.5, 4, '1234.5'],
  ])('%s 以 %s 位小數送出為 %s', (value, precision, expected) => {
    expect(toDecimalString(value, precision)).toBe(expected);
  });
});

describe('現貨帳本（平均成本法）', () => {
  it('買入手續費扣基礎幣、賣出手續費扣計價幣', () => {
    const book = new LedgerBook(1000, [
      fill({ fee: 0.01, feeAsset: 'base', price: 100, size: 1 }),
      fill({ fee: 0.5, price: 120, side: 'SELL', size: 0.99 }),
    ]);

    expect(book.snapshot()).toEqual({
      averageCost: 0,
      position: 0,
      quoteBalance: 1000 - 100 + 120 * 0.99 - 0.5,
      realizedPnl: 120 * 0.99 - 0.5 - 100,
    });
  });

  it('分批買入以均價結算部分賣出', () => {
    const book = new LedgerBook(1000, [
      fill({ price: 100, size: 1 }),
      fill({ price: 200, size: 1 }),
      fill({ price: 180, side: 'SELL', size: 1 }),
    ]);

    expect(book.snapshot()).toMatchObject({
      averageCost: 150,
      position: 1,
      realizedPnl: 30,
    });
  });
});

describe('SpotAccount 可動用資金', () => {
  it('掛單中的買單金額要先預留', () => {
    const account = new SpotAccount(100);
    const pending = [openOrder({ price: 50, size: 1 })];

    expect(
      account.rejection(
        { price: 50, side: 'BUY', size: 1, type: 'LIMIT' },
        pending,
      ),
    ).toBeNull();
    expect(
      account.rejection(
        { price: 51, side: 'BUY', size: 1, type: 'LIMIT' },
        pending,
      ),
    ).toBe('insufficient_budget');
  });

  it('部分成交的掛單只預留未成交的部分', () => {
    const account = new SpotAccount(100);

    expect(
      account.rejection({ price: 50, side: 'BUY', size: 1.5, type: 'LIMIT' }, [
        openOrder({ filledSize: 0.5, price: 50, size: 1 }),
      ]),
    ).toBeNull();
  });

  it('只能賣出機器人自己買進、且沒被賣單佔住的部位', () => {
    const account = new SpotAccount(1000, [fill({ size: 2 })]);
    const pending = [openOrder({ side: 'SELL', size: 1.5 })];

    expect(
      account.rejection({ side: 'SELL', size: 0.5, type: 'MARKET' }, pending),
    ).toBeNull();
    expect(
      account.rejection({ side: 'SELL', size: 0.6, type: 'MARKET' }, pending),
    ).toBe('insufficient_position');
  });
});

const tiers: RiskTier[] = [
  { maintMarginRatio: 0.01, notionalLimit: 10_000, quickDeduction: 0 },
  { maintMarginRatio: 0.02, notionalLimit: 100_000, quickDeduction: 100 },
];

const futures = (fills: BotFill[] = [], investment = 1000, leverage = 5) =>
  new FuturesAccount({
    fills,
    investment,
    leverage,
    liquidationFeeRate: 0.005,
    riskTiers: tiers,
  });

describe('FuturesAccount（逐倉）', () => {
  it('加倉更新均價、反向成交先平倉再以成交價開新倉', () => {
    const account = futures([
      fill({ price: 100, size: 1 }),
      fill({ price: 110, size: 1 }),
      fill({ price: 120, side: 'SELL', size: 3 }),
    ]);

    expect(account.snapshot()).toMatchObject({
      entryPrice: 120,
      position: -1,
      realizedPnl: (120 - 105) * 2,
    });
  });

  it('手續費從保證金扣除', () => {
    const account = futures([fill({ fee: 0.4, price: 100, size: 1 })]);

    expect(account.snapshot()).toMatchObject({
      fees: 0.4,
      marginBalance: 999.6,
    });
  });

  it('加倉超過槓桿可用保證金會被擋，含同向掛單', () => {
    const account = futures([fill({ price: 100, size: 30 })]);

    expect(
      account.rejection(
        { price: 100, side: 'BUY', size: 15, type: 'LIMIT' },
        [openOrder({ price: 100, size: 5 })],
        100,
      ),
    ).toBeNull();
    expect(
      account.rejection(
        { price: 100, side: 'BUY', size: 16, type: 'LIMIT' },
        [openOrder({ price: 100, size: 5 })],
        100,
      ),
    ).toBe('insufficient_margin');
  });

  it('減倉單不檢查保證金', () => {
    const account = futures([fill({ price: 100, size: 50 })]);

    expect(account.reduces({ side: 'SELL', type: 'MARKET' })).toBe(true);
    expect(
      account.rejection({ side: 'SELL', size: 50, type: 'MARKET' }, [], 100),
    ).toBeNull();
  });

  it.each([
    ['多單', 'BUY' as const, 50],
    ['空單', 'SELL' as const, -50],
  ])('%s的強平價符合維持保證金方程', (_, side, position) => {
    const account = futures([fill({ price: 100, side, size: 50 })]);
    const price = account.liquidationPrice()!;

    expect(account.snapshot().position).toBe(position);
    expect(Math.sign(price - 100)).toBe(-Math.sign(position));
    expect(account.equity(price)).toBeCloseTo(
      Math.abs(position) * price * 0.01,
      6,
    );
  });

  it('標記價格未觸及強平價不強平', () => {
    const account = futures([fill({ price: 100, size: 50 })]);

    expect(account.liquidation(82, 0)).toBeNull();
  });

  it('跳空越過強平價時以強平價成交，手續費最多扣到保證金歸零', () => {
    const account = futures([fill({ price: 100, size: 50 })]);
    const liquidationPrice = account.liquidationPrice()!;

    const result = account.liquidation(70, 1)!;

    expect(result).toMatchObject({
      price: liquidationPrice,
      side: 'SELL',
      size: 50,
    });
    expect(result.fee).toBeLessThanOrEqual(account.equity(liquidationPrice));
    account.apply(result);
    expect(account.snapshot().marginBalance).toBeGreaterThanOrEqual(-1e-9);
  });

  it('資金費率為正時多方付錢、空方收錢', () => {
    expect(futures([fill({ size: 2 })]).fundingAmount(0.001, 100)).toBe(-0.2);
    expect(
      futures([fill({ side: 'SELL', size: 2 })]).fundingAmount(0.001, 100),
    ).toBe(0.2);
  });
});
