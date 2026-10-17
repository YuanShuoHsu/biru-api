import { Injectable } from '@nestjs/common';

import type {
  QuantCandleDto,
  QuantMarketDto,
  QuantTradeDto,
} from '../dto/quant-market.dto';
import { PionexRestClient } from '../pionex/pionex-rest.client';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service';
import type {
  PionexDepth,
  PionexKline,
  PionexKlineInterval,
  PionexTicker,
  PionexTrade,
} from '../pionex/pionex.types';

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

  async listMarkets(): Promise<QuantMarketDto[]> {
    const [symbols, { tickers }] = await Promise.all([
      this.symbols.list(),
      this.rest.get<{ tickers: PionexTicker[] }>('/api/v1/market/tickers', {
        type: 'SPOT',
      }),
    ]);
    const tickerBySymbol = new Map(tickers.map((t) => [t.symbol, t]));

    return symbols.flatMap((symbol) => {
      const ticker = tickerBySymbol.get(symbol.symbol);
      if (!symbol.enable || !ticker) return [];

      return {
        amountPrecision: symbol.amountPrecision,
        baseCurrency: symbol.baseCurrency,
        close: Number(ticker.close),
        high: Number(ticker.high),
        low: Number(ticker.low),
        maxTradeSize: Number(symbol.maxTradeSize),
        minAmount: Number(symbol.minAmount),
        minTradeSize: Number(symbol.minTradeSize),
        open: Number(ticker.open),
        pricePrecision: symbol.quotePrecision,
        quoteCurrency: symbol.quoteCurrency,
        quoteVolume: Number(ticker.amount),
        sizePrecision: symbol.basePrecision,
        symbol: symbol.symbol,
        volume: Number(ticker.volume),
      };
    });
  }

  async findCandles(
    symbol: string,
    interval: PionexKlineInterval,
    limit: number,
    endTime?: number,
  ): Promise<QuantCandleDto[]> {
    await this.symbols.get(symbol);
    const { klines } = await this.rest.get<{ klines: PionexKline[] }>(
      '/api/v1/market/klines',
      { endTime, interval, limit, symbol },
    );

    return klines.map(toCandle).sort((a, b) => a.time - b.time);
  }

  /** 往回分頁取 K 線，交易所單次最多 500 根、最多往回 10000 根 */
  async findCandleHistory(
    symbol: string,
    interval: PionexKlineInterval,
    count: number,
  ): Promise<QuantCandleDto[]> {
    const candles: QuantCandleDto[] = [];
    let endTime: number | undefined;

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

  async findDepth(symbol: string, limit: number) {
    const { asks, bids } = await this.rest.get<PionexDepth>(
      '/api/v1/market/depth',
      { limit, symbol },
    );
    const toLevels = (levels: PionexDepth['asks']) =>
      levels.map(([price, size]): [number, number] => [
        Number(price),
        Number(size),
      ]);

    return { asks: toLevels(asks), bids: toLevels(bids) };
  }

  async findTrades(symbol: string): Promise<QuantTradeDto[]> {
    await this.symbols.get(symbol);
    const { trades } = await this.rest.get<{ trades: PionexTrade[] }>(
      '/api/v1/market/trades',
      { limit: 100, symbol },
    );

    return trades.map(toTrade);
  }
}
