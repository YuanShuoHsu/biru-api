import { SpotAccount } from './account.js';
import {
  type Broker,
  BotSession,
  type SessionStore,
  type SubmittedOrder,
} from './bot-session.js';
import type {
  BotFill,
  OrderRequest,
  Strategy,
  StrategyContext,
  SymbolSpec,
} from './types.js';

const spec: SymbolSpec = {
  amountPrecision: 2,
  base: 'BTC',
  maxTradeSize: 10,
  minAmount: 5,
  minTradeSize: 0.0001,
  pricePrecision: 2,
  quote: 'USDT',
  sizePrecision: 4,
  symbol: 'BTC_USDT',
};

const createStore = () => {
  let sequence = 0;

  return {
    insertFill: vi.fn<SessionStore['insertFill']>(),
    insertFunding: vi.fn<SessionStore['insertFunding']>(),
    insertOrder: vi.fn<SessionStore['insertOrder']>(),
    log: vi.fn<SessionStore['log']>(),
    nextClientOrderId: vi.fn(() => Promise.resolve(`c${++sequence}`)),
    setPaused: vi.fn<SessionStore['setPaused']>(),
    setStopped: vi.fn<SessionStore['setStopped']>(),
    updateOrder: vi.fn<SessionStore['updateOrder']>(),
  };
};

const createBroker = () => ({
  cancel: vi.fn<Broker['cancel']>().mockResolvedValue(undefined),
  submit: vi.fn<Broker['submit']>().mockResolvedValue([]),
});

const createSession = ({
  fills = [],
  investment = 1000,
  maxOrderAmount,
  strategy = {},
}: {
  fills?: BotFill[];
  investment?: number;
  maxOrderAmount?: number;
  strategy?: Partial<Strategy>;
} = {}) => {
  const broker = createBroker();
  const store = createStore();
  let context!: StrategyContext;

  const session = new BotSession({
    account: new SpotAccount(investment, fills),
    broker,
    candles: () => Promise.resolve([]),
    config: {},
    createStrategy: (created) => {
      context = created;
      return { start: () => Promise.resolve(), ...strategy };
    },
    fills,
    investment,
    maxOrderAmount,
    now: () => 0,
    orders: [],
    spec,
    store,
  });

  return {
    broker,
    place: (request: OrderRequest) => context.placeOrder(request),
    session,
    store,
  };
};

const skippedReasons = (store: ReturnType<typeof createStore>) =>
  store.log.mock.calls
    .filter(([kind]) => kind === 'order_skipped')
    .map(([, payload]) => payload?.reason);

describe('BotSession 下單風控', () => {
  it('價格四捨五入、數量無條件捨去到交易所精度再送出', async () => {
    const { broker, place } = createSession();

    await place({ price: 100.005, side: 'BUY', size: 0.123456, type: 'LIMIT' });

    expect(broker.submit).toHaveBeenCalledWith(
      expect.objectContaining({ price: 100.01, size: 0.1234 }),
    );
  });

  it.each<[string, OrderRequest]>([
    [
      'below_minimum',
      { price: 100, side: 'BUY', size: 0.00001, type: 'LIMIT' },
    ],
    ['below_minimum', { price: 100, side: 'BUY', size: 0.01, type: 'LIMIT' }],
    ['above_maximum', { price: 1, side: 'BUY', size: 11, type: 'LIMIT' }],
    ['invalid_price', { price: 0, side: 'BUY', size: 1, type: 'LIMIT' }],
    ['below_minimum', { amount: 4.99, side: 'BUY', type: 'MARKET' }],
    ['insufficient_budget', { amount: 1000.01, side: 'BUY', type: 'MARKET' }],
    [
      'insufficient_position',
      { price: 100, side: 'SELL', size: 0.1, type: 'LIMIT' },
    ],
  ])('擋下 %s 的委託，不送到交易所', async (reason, request) => {
    const { broker, place, store } = createSession();

    await expect(place(request)).resolves.toBeNull();
    expect(broker.submit).not.toHaveBeenCalled();
    expect(store.insertOrder).not.toHaveBeenCalled();
    expect(skippedReasons(store)).toEqual([reason]);
  });

  it('掛著的買單佔用的資金不能重複使用', async () => {
    const { broker, place, store } = createSession({ investment: 100 });

    await place({ price: 60, side: 'BUY', size: 1, type: 'LIMIT' });
    await place({ price: 50, side: 'BUY', size: 1, type: 'LIMIT' });

    expect(broker.submit).toHaveBeenCalledTimes(1);
    expect(skippedReasons(store)).toEqual(['insufficient_budget']);
  });

  it('單筆開倉金額上限只擋加倉，平倉不受限', async () => {
    const position: BotFill = {
      fee: 0,
      feeAsset: 'quote',
      orderId: 'seed',
      price: 100,
      side: 'BUY',
      size: 5,
      time: 0,
    };
    const { broker, place, session, store } = createSession({
      fills: [position],
      investment: 10_000,
      maxOrderAmount: 200,
    });
    await session.handlePrice(100);

    await place({ price: 100, side: 'BUY', size: 3, type: 'LIMIT' });
    await place({ price: 100, side: 'SELL', size: 3, type: 'LIMIT' });

    expect(skippedReasons(store)).toEqual(['above_order_limit']);
    expect(broker.submit).toHaveBeenCalledTimes(1);
    expect(broker.submit.mock.calls[0][0]).toMatchObject({ side: 'SELL' });
  });

  it('交易所拒單時記為 rejected，機器人繼續跑', async () => {
    const { broker, place, session, store } = createSession();
    broker.submit.mockRejectedValueOnce(new Error('insufficient balance'));

    await expect(
      place({ price: 100, side: 'BUY', size: 0.1, type: 'LIMIT' }),
    ).resolves.toBeNull();

    expect(store.updateOrder).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'rejected' }),
    );
    expect(store.log).toHaveBeenCalledWith(
      'order_rejected',
      expect.objectContaining({ message: 'insufficient balance' }),
    );
    expect(session.isStopped).toBe(false);
  });

  it('停止後不再下單', async () => {
    const { broker, place, session } = createSession();

    await session.stop('user');
    await expect(
      place({ price: 100, side: 'BUY', size: 0.1, type: 'LIMIT' }),
    ).resolves.toBeNull();
    expect(broker.submit).not.toHaveBeenCalled();
  });
});

describe('BotSession 停機', () => {
  it('停止時撤掉所有掛單、讓策略收尾並記錄原因', async () => {
    const stop = vi.fn<NonNullable<Strategy['stop']>>();
    const { broker, place, session, store } = createSession({
      strategy: { stop },
    });
    await place({ price: 100, side: 'BUY', size: 0.1, type: 'LIMIT' });

    await session.stop('user', { closeModel: 'TO_QUOTE' });

    expect(broker.cancel).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith('TO_QUOTE');
    expect(session.openOrders()).toEqual([]);
    expect(store.setStopped).toHaveBeenCalledWith('user', false);
  });

  it('策略丟錯時停機並標記為錯誤，不再處理後續價格', async () => {
    const onPrice = vi
      .fn<NonNullable<Strategy['onPrice']>>()
      .mockRejectedValueOnce(new Error('boom'));
    const { session, store } = createSession({ strategy: { onPrice } });

    await expect(session.handlePrice(100)).rejects.toThrow('boom');
    await session.handlePrice(101);

    expect(store.setStopped).toHaveBeenCalledWith('boom', true);
    expect(onPrice).toHaveBeenCalledTimes(1);
  });

  it('交易所回報掛單被撤（使用者在 Pionex 手動撤單）就停機', async () => {
    const { place, session, store } = createSession();
    await place({ price: 100, side: 'BUY', size: 0.1, type: 'LIMIT' });

    await session.reconcile((order: SubmittedOrder) =>
      Promise.resolve({
        fills: [],
        order: { exchangeOrderId: order.exchangeOrderId, status: 'canceled' },
      }),
    );

    expect(session.isStopped).toBe(true);
    expect(store.setStopped).toHaveBeenCalledWith(
      'order_canceled_externally',
      true,
    );
  });

  it('對帳帶回的成交會記入帳本並結束掛單', async () => {
    const { place, session } = createSession();
    await place({ price: 100, side: 'BUY', size: 0.1, type: 'LIMIT' });
    const [open] = session.openOrders();

    await session.reconcile(() =>
      Promise.resolve({
        fills: [
          {
            fee: 0,
            feeAsset: 'quote',
            id: 'pionex:1',
            orderId: open.id,
            price: 100,
            side: 'BUY',
            size: 0.1,
            time: 1,
          },
        ],
        order: { filledAmount: 10, filledSize: 0.1, status: 'filled' },
      }),
    );

    expect(session.openOrders()).toEqual([]);
    expect(session.ledger).toMatchObject({ position: 0.1, quoteBalance: 990 });
  });

  it.each([
    [0.5, 0.5, false],
    [0.5, 0.5000001, false],
    [0.5, 0.2, true],
  ])(
    '交易所倉位 %s、帳本倉位 %s：停機 %s',
    async (exchange, ledger, stopped) => {
      const { session, store } = createSession();

      await session.verifyPosition(
        () => Promise.resolve(exchange),
        () => ledger,
        0.000001,
      );

      expect(session.isStopped).toBe(stopped);
      if (stopped)
        expect(store.setStopped).toHaveBeenCalledWith(
          'futures_position_mismatch',
          true,
        );
    },
  );

  it('還有掛單時不比對倉位，避免成交途中誤判', async () => {
    const { place, session } = createSession();
    await place({ price: 100, side: 'BUY', size: 0.1, type: 'LIMIT' });
    const exchangePosition = vi.fn(() => Promise.resolve(99));

    await session.verifyPosition(exchangePosition, () => 0, 0.000001);

    expect(exchangePosition).not.toHaveBeenCalled();
    expect(session.isStopped).toBe(false);
  });
});
