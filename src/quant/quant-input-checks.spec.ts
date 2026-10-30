import { BadRequestException } from '@nestjs/common';

import { QuantFuturesService } from './account/quant-futures.service.js';
import { QuantBacktestService } from './bots/quant-backtest.service.js';
import type {
  IndicatorBacktestDto,
  IndicatorConditionDto,
} from './dto/quant-bot.dto.js';
import type { PreviewFuturesOrderDto } from './dto/quant-futures.dto.js';
import { isConditionComplete } from './engine/strategies/indicator-conditions.js';

const i18n = { t: vi.fn(() => 'error') };

describe('isConditionComplete', () => {
  it.each<[IndicatorConditionDto, boolean]>([
    [{ kind: 'rsi', operator: 'above', value: 70 }, true],
    [{ kind: 'rsi', operator: 'above' }, false],
    [{ kind: 'rsi', operator: 'above', value: null as never }, false],
    [{ kind: 'maCross', fast: 7, slow: 25, direction: 'golden' }, true],
    [{ kind: 'maCross', fast: 25, slow: 7, direction: 'golden' }, false],
    [
      { kind: 'emaCross', fast: null as never, slow: 25, direction: 'golden' },
      false,
    ],
    [{ kind: 'macdCross', direction: 'death' }, true],
    [{ kind: 'macdCross' }, false],
    [{ kind: 'bollinger', band: 'upper' }, true],
    [{ kind: 'bollinger', band: null as never }, false],
  ] as [IndicatorConditionDto, boolean][])('%j → %s', (condition, complete) => {
    expect(isConditionComplete(condition)).toBe(complete);
  });
});

describe('指標回測', () => {
  it('條件不完整時回 400，不打交易所', async () => {
    const market = { findCandleHistory: vi.fn() };
    const symbols = { marketTypeOf: vi.fn(), get: vi.fn(), getPerp: vi.fn() };
    const service = new QuantBacktestService(
      i18n as never,
      market as never,
      symbols as never,
    );

    await expect(
      service.run('indicator', {
        candleCount: 100,
        config: {
          entry: [{ kind: 'rsi', operator: 'below' }],
          exit: [{ kind: 'macdCross', direction: 'death' }],
        },
        interval: '1H',
        investment: 100,
        symbol: 'BTC_USDT',
      } as unknown as IndicatorBacktestDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(symbols.marketTypeOf).not.toHaveBeenCalled();
    expect(market.findCandleHistory).not.toHaveBeenCalled();
  });
});

describe('合約下單預覽', () => {
  const symbols = { getPerp: vi.fn(), riskTiersOf: vi.fn() };
  const service = new QuantFuturesService(
    {} as never,
    i18n as never,
    { markPrice: vi.fn() } as never,
    {} as never,
    symbols as never,
  );

  it.each([undefined, '0', '0.00'])(
    '限價單價格是 %j 時回 400，不打交易所',
    async (price) => {
      await expect(
        service.previewOrder('user', 'account', {
          price,
          size: '0.001',
          symbol: 'BTC_USDT_PERP',
          type: 'LIMIT',
        } as PreviewFuturesOrderDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(symbols.getPerp).not.toHaveBeenCalled();
    },
  );

  it('限價單送出時價格是 0 也回 400', async () => {
    await expect(
      service.placeOrder('user', 'account', {
        positionSide: 'LONG',
        price: '0',
        side: 'BUY',
        size: '0.001',
        symbol: 'BTC_USDT_PERP',
        type: 'LIMIT',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(symbols.getPerp).not.toHaveBeenCalled();
  });
});
