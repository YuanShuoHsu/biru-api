import { Injectable } from '@nestjs/common';

import type {
  QuantCandleDto,
  QuantMarketDto,
  QuantTradeDto,
} from '../dto/quant-market.dto';
import { PionexRestClient } from '../pionex/pionex-rest.client';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service';
import type {
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
        baseCurrency: symbol.baseCurrency,
        close: Number(ticker.close),
        high: Number(ticker.high),
        low: Number(ticker.low),
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

  async findTrades(symbol: string): Promise<QuantTradeDto[]> {
    await this.symbols.get(symbol);
    const { trades } = await this.rest.get<{ trades: PionexTrade[] }>(
      '/api/v1/market/trades',
      { limit: 100, symbol },
    );

    return trades.map(toTrade);
  }
}
