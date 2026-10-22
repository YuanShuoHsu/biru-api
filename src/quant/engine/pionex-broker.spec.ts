import {
  PionexApiError,
  type PionexRestClient,
} from '../pionex/pionex-rest.client.js';
import type { PionexFill, PionexOrder } from '../pionex/pionex.types.js';

import type { SubmittedOrder } from './bot-session.js';
import { PionexBroker } from './pionex-broker.js';
import type { SymbolSpec } from './types.js';

const spec: SymbolSpec = {
  amountPrecision: 2,
  base: 'BTC',
  maxTradeSize: 10,
  minAmount: 5,
  minTradeSize: 0.0001,
  pricePrecision: 2,
  quote: 'USDT',
  sizePrecision: 6,
  symbol: 'BTC_USDT',
};

const exchangeOrder = (overrides: Partial<PionexOrder>): PionexOrder => ({
  IOC: false,
  createTime: 0,
  fee: '0',
  feeCoin: 'USDT',
  filledAmount: '0',
  filledSize: '0',
  orderId: '42',
  side: 'BUY',
  size: '0.5',
  status: 'OPEN',
  symbol: 'BTC_USDT',
  type: 'LIMIT',
  updateTime: 0,
  ...overrides,
});

const exchangeFill = (overrides: Partial<PionexFill>): PionexFill => ({
  fee: '0.01',
  feeCoin: 'USDT',
  id: '1',
  orderId: '42',
  price: '100',
  role: 'TAKER',
  side: 'BUY',
  size: '0.1',
  symbol: 'BTC_USDT',
  timestamp: 1,
  ...overrides,
});

const submitted = (overrides: Partial<SubmittedOrder>): SubmittedOrder => ({
  clientOrderId: 'c1',
  filledAmount: 0,
  filledSize: 0,
  id: 'o1',
  side: 'BUY',
  status: 'open',
  type: 'LIMIT',
  ...overrides,
});

const createBroker = ({
  fills = [],
  hasLease = true,
  order = exchangeOrder({}),
}: {
  fills?: PionexFill[];
  hasLease?: boolean;
  order?: PionexOrder;
} = {}) => {
  const signed = vi.fn(
    (
      _credentials: unknown,
      method: string,
      path: string,
      _options?: unknown,
    ) => {
      if (method === 'POST') return Promise.resolve({ orderId: '42' });
      if (path.endsWith('orderByClientOrderId')) return Promise.resolve(order);
      if (path.endsWith('fillsByOrderId')) return Promise.resolve({ fills });
      return Promise.resolve({});
    },
  );

  return {
    broker: new PionexBroker(
      { signed } as unknown as PionexRestClient,
      { apiKey: 'k', apiSecret: 's' },
      spec,
      () => hasLease,
    ),
    signed,
  };
};

describe('PionexBroker', () => {
  it('沒有引擎租約時不下單，避免兩個實例重複下單', async () => {
    const { broker, signed } = createBroker({ hasLease: false });

    await expect(
      broker.submit(submitted({ price: 1, size: 1 })),
    ).rejects.toThrow('Engine lease lost');
    expect(signed).not.toHaveBeenCalled();
  });

  it('限價單以交易所精度的十進位字串送出、不帶科學記號', async () => {
    const { broker, signed } = createBroker();
    const order = submitted({ price: 64_000.1, size: 0.0000001 + 0.00005 });

    await expect(broker.submit(order)).resolves.toEqual([]);

    expect(signed).toHaveBeenCalledTimes(1);
    expect(signed.mock.calls[0][3]).toEqual({
      body: {
        clientOrderId: 'c1',
        price: '64000.1',
        side: 'BUY',
        size: '0.00005',
        symbol: 'BTC_USDT',
        type: 'LIMIT',
      },
    });
    expect(order.exchangeOrderId).toBe('42');
  });

  it('市價買單送出後立即對帳帶回成交，已知的成交不重複記', async () => {
    const { broker } = createBroker({
      fills: [exchangeFill({ id: '1' }), exchangeFill({ id: '2' })],
      order: exchangeOrder({
        filledAmount: '20',
        filledSize: '0.2',
        status: 'CLOSED',
        type: 'MARKET',
      }),
    });
    const order = submitted({ amount: 20, type: 'MARKET' });

    const fills = await broker.submit(order);

    expect(fills.map(({ id }) => id)).toEqual(['pionex:1', 'pionex:2']);
    expect(order).toMatchObject({ filledSize: 0.2, status: 'filled' });

    const { fills: again } = await broker.sync(
      order,
      new Set(['pionex:1', 'pionex:2']),
    );
    expect(again).toEqual([]);
  });

  it('限價單部分成交後關閉視為已撤銷', async () => {
    const { broker } = createBroker({
      fills: [exchangeFill({})],
      order: exchangeOrder({ filledSize: '0.1', status: 'CLOSED' }),
    });

    const { order } = await broker.sync(submitted({}), new Set());

    expect(order.status).toBe('canceled');
  });

  it('手續費用第三種幣扣時不計入成本', async () => {
    const { broker } = createBroker({
      fills: [exchangeFill({ fee: '0.002', feeCoin: 'BNB' })],
      order: exchangeOrder({ filledSize: '0.1' }),
    });

    const { fills } = await broker.sync(submitted({}), new Set());

    expect(fills[0].fee).toBe(0);
  });

  it('撤單失敗但訂單其實已結束，視為撤單完成', async () => {
    const { broker, signed } = createBroker({
      order: exchangeOrder({ filledSize: '0.5', status: 'CLOSED' }),
    });
    signed.mockImplementationOnce(() =>
      Promise.reject(new PionexApiError('TRADE_ORDER_NOT_FOUND', 'gone')),
    );

    await expect(
      broker.cancel(submitted({ exchangeOrderId: '42' })),
    ).resolves.toBeUndefined();
  });

  it('撤單失敗且訂單仍在掛單中，要把錯誤丟出去', async () => {
    const { broker, signed } = createBroker();
    signed.mockImplementationOnce(() =>
      Promise.reject(new PionexApiError('TRADE_REJECTED', 'busy')),
    );

    await expect(
      broker.cancel(submitted({ exchangeOrderId: '42' })),
    ).rejects.toThrow(PionexApiError);
  });
});
