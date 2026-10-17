import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  QuantCandleDto,
  QuantFundingRateDto,
  QuantMarketDto,
  QuantPerpInfoDto,
  QuantTradeDto,
} from '../dto/quant-market.dto';
import { PionexRestClient } from '../pionex/pionex-rest.client';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service';
import {
  candleStartOf,
  isNativeKlineInterval,
  type NativeKlineInterval,
  type PionexDepth,
  type PionexFuturesIndex,
  type PionexKline,
  type PionexMarketType,
  type PionexKlineInterval,
  type PionexTicker,
  type PionexTrade,
} from '../pionex/pionex.types';

// 合約行情端點的權重是 5，現貨是 1
// 交易所最多只能往回取 10000 根
const MAX_HISTORY_CANDLES = 10_000;

const weightOf = (type: PionexMarketType) => (type === 'PERP' ? 5 : 1);

export const toCandle = (kline: PionexKline): QuantCandleDto => ({
  close: Number(kline.close),
  high: Number(kline.high),
  low: Number(kline.low),
  open: Number(kline.open),
  time: kline.time,
  volume: Number(kline.volume),
});

export const toTrade = (trade: PionexTrade): QuantTradeDto => ({
  id: trade.tradeId,
  price: Number(trade.price),
  side: trade.side,
  size: Number(trade.size),
  time: trade.timestamp,
});

@Injectable()
export class QuantMarketService {
  constructor(
    private readonly rest: PionexRestClient,
    private readonly symbols: PionexSymbolsService,
  ) {}

  async listMarkets(type: PionexMarketType): Promise<QuantMarketDto[]> {
    const tickers = await this.rest
      .get<{
        tickers: PionexTicker[];
      }>('/api/v1/market/tickers', { type }, weightOf(type))
      .then(({ tickers }) => new Map(tickers.map((t) => [t.symbol, t])));
    const stats = (ticker: PionexTicker) => ({
      close: Number(ticker.close),
      high: Number(ticker.high),
      low: Number(ticker.low),
      open: Number(ticker.open),
      quoteVolume: Number(ticker.amount),
      volume: Number(ticker.volume),
    });

    if (type === 'SPOT')
      return (await this.symbols.list()).flatMap((symbol) => {
        const ticker = tickers.get(symbol.symbol);
        if (!ticker) return [];

        return {
          ...stats(ticker),
          amountPrecision: symbol.amountPrecision,
          baseCurrency: symbol.baseCurrency,
          maxTradeSize: Number(symbol.maxTradeSize),
          minAmount: Number(symbol.minAmount),
          minTradeSize: Number(symbol.minTradeSize),
          pricePrecision: symbol.quotePrecision,
          quoteCurrency: symbol.quoteCurrency,
          sizePrecision: symbol.basePrecision,
          symbol: symbol.symbol,
          type,
        };
      });

    const [symbols, riskTiers] = await Promise.all([
      this.symbols.listPerp(),
      this.symbols.allRiskTiers(),
    ]);

    return symbols.flatMap((symbol) => {
      const ticker = tickers.get(symbol.symbol);
      const [firstTier] = riskTiers.get(symbol.symbol) ?? [];
      if (!ticker || !firstTier) return [];

      return {
        ...stats(ticker),
        // 合約市價單以數量下單，沒有另外的金額精度
        amountPrecision: symbol.quotePrecision,
        baseCurrency: symbol.baseCurrency,
        maxTradeSize: Number(symbol.maxSizeLimit),
        minAmount: Number(symbol.minNotional),
        minTradeSize: Number(symbol.minSizeLimit),
        perp: {
          liquidationFeeRate: Number(symbol.liquidationFeeRate),
          maxLeverage: Number(firstTier.maxLeverage),
          maxMarketSize: Number(symbol.maxSizeMarket),
          minMarketSize: Number(symbol.minSizeMarket),
        },
        pricePrecision: symbol.quotePrecision,
        quoteCurrency: symbol.quoteCurrency,
        sizePrecision: symbol.basePrecision,
        symbol: symbol.symbol,
        type,
      };
    });
  }

  async findPerpInfo(symbol: string): Promise<QuantPerpInfoDto> {
    await this.symbols.getPerp(symbol);
    const [{ indexes }, { openInterests }, riskTiers] = await Promise.all([
      this.rest.get<{ indexes: PionexFuturesIndex[] }>(
        '/api/v1/market/indexes',
        { symbol },
        weightOf('PERP'),
      ),
      this.rest.get<{
        openInterests: { openInterest: string; symbol: string }[];
      }>('/api/v1/market/openInterests', {}, weightOf('PERP')),
      this.symbols.riskTiersOf(symbol),
    ]);
    const [index] = indexes;

    return {
      indexPrice: Number(index.indexPrice),
      markPrice: Number(index.markPrice),
      nextFundingRate: Number(index.nextFundingRate),
      nextFundingTime: index.nextFundingTime,
      openInterest: Number(
        openInterests.find((item) => item.symbol === symbol)?.openInterest ?? 0,
      ),
      riskTiers: riskTiers.map((tier) => ({
        maintMarginRatio: Number(tier.maintMarginRatio),
        maxLeverage: Number(tier.maxLeverage),
        notionalLimit: Number(tier.notionalLimit),
        quickDeduction: Number(tier.quickDeduction),
      })),
    };
  }

  async findPerpIndex(symbol: string): Promise<PionexFuturesIndex> {
    const { indexes } = await this.rest.get<{ indexes: PionexFuturesIndex[] }>(
      '/api/v1/market/indexes',
      { symbol },
      weightOf('PERP'),
    );
    const [index] = indexes;
    if (!index) throw new NotFoundException(`Unknown symbol ${symbol}`);

    return index;
  }

  async findFundingRates(
    symbol: string,
    limit: number,
    endTime?: number,
  ): Promise<QuantFundingRateDto[]> {
    await this.symbols.getPerp(symbol);
    const { rates } = await this.rest.get<{
      rates: { fundingRate: string; fundingTime: number }[];
    }>(
      '/api/v1/market/fundingRates',
      { endTime, limit, symbol },
      weightOf('PERP'),
    );

    return rates
      .map(({ fundingRate, fundingTime }) => ({
        rate: Number(fundingRate),
        time: fundingTime,
      }))
      .sort((a, b) => a.time - b.time);
  }

  async findCandles(
    symbol: string,
    interval: PionexKlineInterval,
    limit: number,
    endTime?: number,
  ): Promise<QuantCandleDto[]> {
    if (!isNativeKlineInterval(interval))
      return (
        await this.aggregateFromDaily(symbol, interval, limit, endTime)
      ).slice(-limit);

    const type = await this.symbols.marketTypeOf(symbol);
    const { klines } = await this.rest.get<{ klines: PionexKline[] }>(
      '/api/v1/market/klines',
      { endTime, interval, limit, symbol },
      weightOf(type),
    );

    return klines.map(toCandle).sort((a, b) => a.time - b.time);
  }

  /** 往回分頁取 K 線，交易所單次最多 500 根、最多往回 10000 根 */
  async findCandleHistory(
    symbol: string,
    interval: PionexKlineInterval,
    count: number,
  ): Promise<QuantCandleDto[]> {
    if (!isNativeKlineInterval(interval))
      return (await this.aggregateFromDaily(symbol, interval, count)).slice(
        -count,
      );

    return this.pageCandles(symbol, interval, count);
  }

  private async pageCandles(
    symbol: string,
    interval: NativeKlineInterval,
    count: number,
    before?: number,
  ): Promise<QuantCandleDto[]> {
    const candles: QuantCandleDto[] = [];
    let endTime = before;

    while (candles.length < count) {
      // endTime 含邊界，會把上一頁最舊的那根再回傳一次，所以多取一根
      const page = await this.findCandles(
        symbol,
        interval,
        Math.min(500, count - candles.length + (endTime === undefined ? 0 : 1)),
        endTime,
      );
      const older = page.filter(
        ({ time }) => endTime === undefined || time < endTime,
      );
      if (!older.length) break;

      candles.unshift(...older);
      endTime = older[0].time;
    }

    return candles;
  }

  // 週、月 K 由日 K 合成
  private async aggregateFromDaily(
    symbol: string,
    interval: Exclude<PionexKlineInterval, NativeKlineInterval>,
    count: number,
    endTime?: number,
  ): Promise<QuantCandleDto[]> {
    const daysPerCandle = interval === '1W' ? 7 : 31;
    const requested = Math.min(
      MAX_HISTORY_CANDLES,
      (count + 1) * daysPerCandle,
    );
    const daily = await this.pageCandles(
      symbol,
      '1D',
      requested,
      endTime === undefined ? undefined : endTime + 1,
    );
    const candles: QuantCandleDto[] = [];

    for (const day of daily) {
      const time = candleStartOf(interval, day.time);
      const current = candles.at(-1);
      if (current?.time === time) {
        current.close = day.close;
        current.high = Math.max(current.high, day.high);
        current.low = Math.min(current.low, day.low);
        current.volume += day.volume;
      } else candles.push({ ...day, time });
    }

    // 取滿表示更早還有資料，最舊那根缺了開頭幾天；沒取滿就是上市第一根，照實保留
    if (daily.length === requested && candles[0]?.time < daily[0].time)
      candles.shift();

    return candles;
  }

  async findDepth(symbol: string, limit: number) {
    const { asks, bids } = await this.rest.get<PionexDepth>(
      '/api/v1/market/depth',
      { limit, symbol },
      weightOf(await this.symbols.marketTypeOf(symbol)),
    );
    const toLevels = (levels: PionexDepth['asks']) =>
      levels.map(([price, size]): [number, number] => [
        Number(price),
        Number(size),
      ]);

    return { asks: toLevels(asks), bids: toLevels(bids) };
  }

  async findTrades(symbol: string): Promise<QuantTradeDto[]> {
    const type = await this.symbols.marketTypeOf(symbol);
    const { trades } = await this.rest.get<{ trades: PionexTrade[] }>(
      '/api/v1/market/trades',
      { limit: 100, symbol },
      weightOf(type),
    );

    return trades.map(toTrade);
  }
}
