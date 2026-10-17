import { BadRequestException, Injectable } from '@nestjs/common';

import { I18nContext, I18nService } from 'nestjs-i18n';

import type { I18nTranslations } from 'src/generated/i18n.generated';

import type {
  BacktestDto,
  BacktestResultDto,
  GridConfigDto,
  IndicatorConfigDto,
  QuantBotType,
} from '../dto/quant-bot.dto';
import { runBacktest } from '../engine/backtest';
import { toSymbolSpec } from '../engine/symbol-spec';
import { QuantMarketService } from '../market/quant-market.service';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service';

@Injectable()
export class QuantBacktestService {
  constructor(
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly market: QuantMarketService,
    private readonly symbols: PionexSymbolsService,
  ) {}

  async run(
    type: Exclude<QuantBotType, 'webhook'>,
    { candleCount, config, feeRate, interval, investment, symbol }: BacktestDto,
  ): Promise<BacktestResultDto> {
    const spec = toSymbolSpec(await this.symbols.get(symbol));
    if (
      type === 'grid' &&
      (config as GridConfigDto).top <= (config as GridConfigDto).bottom
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

    const result = await runBacktest({
      candles,
      config,
      feeRate,
      interval: candleInterval,
      investment,
      spec,
      type,
    });

    return {
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
    };
  }
}
