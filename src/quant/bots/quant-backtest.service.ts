import { BadRequestException, Injectable } from '@nestjs/common';

import { I18nContext, I18nService } from 'nestjs-i18n';

import type { I18nTranslations } from 'src/generated/i18n.generated';

import {
  type BacktestDto,
  type BacktestResultDto,
  type FuturesGridConfigDto,
  type GridConfigDto,
  type IndicatorConfigDto,
  isFuturesBot,
  type QuantBotType,
} from '../dto/quant-bot.dto';
import type {
  QuantCandleDto,
  QuantFundingRateDto,
} from '../dto/quant-market.dto';
import {
  type BacktestResult,
  type FuturesBacktestMarket,
  runBacktest,
} from '../engine/backtest';
import { botSymbolSpec, toRiskTiers } from '../engine/symbol-spec';
import { QuantMarketService } from '../market/quant-market.service';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service';

const FUNDING_PAGE_SIZE = 500;

export const toBacktestResultDto = (
  result: BacktestResult,
  candles: QuantCandleDto[],
): BacktestResultDto => ({
  equity: result.equity,
  from: candles[0]?.time ?? 0,
  maxDrawdown: result.maxDrawdown,
  pnl: result.pnl,
  returnRate: result.returnRate,
  sharpe: result.sharpe ?? undefined,
  stoppedReason: result.stoppedReason ?? undefined,
  to: candles.at(-1)?.time ?? 0,
  tradeCount: result.tradeCount,
  trades: result.fills.map(({ price, side, size, time }) => ({
    price,
    side,
    size,
    time,
  })),
  winRate: result.winRate ?? undefined,
});

@Injectable()
export class QuantBacktestService {
  constructor(
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly market: QuantMarketService,
    private readonly symbols: PionexSymbolsService,
  ) {}

  async run(
    type: Exclude<QuantBotType, 'webhook'>,
    { candleCount, config, interval, investment, symbol }: BacktestDto,
  ): Promise<BacktestResultDto> {
    const spec = await botSymbolSpec(this.symbols, { config, symbol, type });
    const isFutures =
      isFuturesBot({ config, type }) ||
      (await this.symbols.marketTypeOf(symbol)) === 'PERP';
    const range = config as GridConfigDto | FuturesGridConfigDto;
    if (
      (type === 'grid' || type === 'futures_grid') &&
      range.top <= range.bottom
    )
      throw new BadRequestException(
        this.i18n.t('common.quant.gridRangeInvalid', {
          lang: I18nContext.current()?.lang,
        }),
      );

    // 指標策略的訊號只在自己的週期收盤時判斷，撮合也用同一個週期
    const candleInterval =
      type === 'indicator' ? (config as IndicatorConfigDto).interval : interval;
    const candles = await this.market.findCandleHistory(
      symbol,
      candleInterval,
      candleCount,
    );

    const common = {
      candles,
      config,
      interval: candleInterval,
      investment,
      spec,
    };
    const result = await runBacktest({
      ...common,
      futures: isFutures
        ? await this.futuresMarket(symbol, candles[0]?.time ?? 0)
        : undefined,
      type,
    });

    return toBacktestResultDto(result, candles);
  }

  async futuresMarket(
    symbol: string,
    from: number,
  ): Promise<FuturesBacktestMarket> {
    const [perp, riskTiers] = await Promise.all([
      this.symbols.getPerp(symbol),
      this.symbols.riskTiersOf(symbol),
    ]);

    // 資金費率一次最多 500 筆，往回翻到涵蓋整段回測
    const fundingRates: QuantFundingRateDto[] = [];
    let endTime: number | undefined;
    for (;;) {
      const page = await this.market.findFundingRates(
        symbol,
        FUNDING_PAGE_SIZE,
        endTime,
      );
      const older = page.filter(
        ({ time }) => endTime === undefined || time < endTime,
      );
      if (!older.length) break;

      fundingRates.unshift(...older);
      endTime = older[0].time;
      if (endTime <= from) break;
    }

    return {
      fundingRates: fundingRates.filter(({ time }) => time >= from),
      liquidationFeeRate: Number(perp.liquidationFeeRate),
      riskTiers: toRiskTiers(riskTiers),
    };
  }
}
