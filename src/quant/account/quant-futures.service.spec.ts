import type {
  PionexFundingFee,
  PionexHistoryPosition,
} from '../pionex/pionex.types.js';

import { QuantFuturesService } from './quant-futures.service.js';

const position = (
  positionId: string,
  updateTime: number,
): PionexHistoryPosition => ({
  amountLong: '-100',
  amountSettled: '0',
  amountShort: '110',
  createTime: updateTime - 1000,
  isolatedMode: 'CROSS',
  leverage: '10',
  positionId,
  positionSide: 'LONG',
  sizeLiquidated: '0',
  sizeLong: '1',
  sizeShort: '-1',
  symbol: 'BTC_USDT_PERP',
  updateTime,
});

const funding = (
  timestamp: number,
  fundingFee = '-0.1',
  symbol = 'BTC_USDT_PERP',
): PionexFundingFee => ({
  fundingCoin: 'USDT',
  fundingFee,
  fundingRate: '0.0001',
  isolatedMode: 'CROSS',
  symbol,
  timestamp,
});

const setup = (batches: unknown[]) => {
  const signed = vi.fn();
  batches.forEach((batch) => signed.mockResolvedValueOnce(batch));
  const service = new QuantFuturesService(
    {
      resolveCredentials: vi.fn().mockResolvedValue({}),
      withExchangeError: (fn: () => Promise<unknown>) => fn(),
    } as never,
    {} as never,
    { signed } as never,
    {} as never,
  );
  const paramsOf = (call: number) =>
    (signed.mock.calls[call][3] as { params: Record<string, unknown> }).params;

  return { paramsOf, service, signed };
};

describe('歷史持倉分頁', () => {
  it('依平倉時間帶 endTime 往回翻，重疊的持倉只出現一次', async () => {
    const first = Array.from({ length: 200 }, (_, index) =>
      position(`p${index}`, 10_000 - index),
    );
    const { paramsOf, service, signed } = setup([
      { positions: first },
      { positions: [first[199], position('older', 9000)] },
    ]);

    const page = await service.listPositionHistory('user', 'account', {
      endTime: 10_000,
      limit: 300,
      startTime: 1,
      symbol: 'BTC_USDT_PERP',
    });

    expect(signed).toHaveBeenCalledTimes(2);
    expect(signed.mock.calls[0][2]).toBe('/uapi/v1/account/historyPositions');
    expect(paramsOf(0)).toEqual({
      endTime: 10_000,
      limit: 200,
      startTime: 1,
      symbol: 'BTC_USDT_PERP',
    });
    expect(paramsOf(1).endTime).toBe(9801);
    expect(page.data.map(({ positionId }) => positionId)).toEqual([
      ...first.map(({ positionId }) => positionId),
      'older',
    ]);
    expect(page.data[0]).toMatchObject({ closeTime: 10_000, realizedPnL: 10 });
    expect(page.nextEndTime).toBeNull();
  });

  it('超過 limit 時截斷並回傳下一頁的 endTime', async () => {
    const { service } = setup([
      {
        positions: Array.from({ length: 200 }, (_, index) =>
          position(`p${index}`, 10_000 - index),
        ),
      },
    ]);

    const page = await service.listPositionHistory('user', 'account', {
      limit: 10,
    });

    expect(page.data).toHaveLength(10);
    expect(page.nextEndTime).toBe(9990);
  });
});

describe('資金費分頁', () => {
  it('依結算時間帶 endTime 往回翻，同一筆紀錄只出現一次', async () => {
    const first = Array.from({ length: 200 }, (_, index) =>
      funding(10_000 - index),
    );
    const { paramsOf, service, signed } = setup([
      { fundings: first },
      { fundings: [first[199], funding(9801, '0.2'), funding(9000)] },
    ]);

    const page = await service.listFundingFees('user', 'account', {
      limit: 300,
    });

    expect(signed.mock.calls[0][2]).toBe('/uapi/v1/trade/fundingFee');
    expect(paramsOf(0)).toEqual({
      endTime: undefined,
      limit: 200,
      startTime: undefined,
      symbol: undefined,
    });
    expect(paramsOf(1).endTime).toBe(9801);
    expect(page.data).toHaveLength(202);
    expect(page.data.slice(-3).map(({ fee, time }) => [time, fee])).toEqual([
      [9801, -0.1],
      [9801, 0.2],
      [9000, -0.1],
    ]);
    expect(page.data[0]).toEqual({
      coin: 'USDT',
      fee: -0.1,
      rate: 0.0001,
      symbol: 'BTC_USDT_PERP',
      time: 10_000,
    });
    expect(page.nextEndTime).toBeNull();
  });

  it('不同交易對同一時間結算的資金費都保留', async () => {
    const first = Array.from({ length: 200 }, (_, index) =>
      funding(10_000 - index),
    );
    const { service } = setup([
      { fundings: first },
      { fundings: [first[199], funding(9801, '-0.1', 'ETH_USDT_PERP')] },
    ]);

    const page = await service.listFundingFees('user', 'account', {
      limit: 300,
    });

    expect(
      page.data.slice(-2).map(({ symbol, time }) => [symbol, time]),
    ).toEqual([
      ['BTC_USDT_PERP', 9801],
      ['ETH_USDT_PERP', 9801],
    ]);
    expect(page.nextEndTime).toBeNull();
  });
});
