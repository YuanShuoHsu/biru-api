import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import type { QuantCandleDto } from '../dto/quant-market.dto';
import {
  PIONEX_TRADES_EVENT,
  PionexPublicStream,
  type PionexTradesEvent,
} from '../pionex/pionex-public-stream';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service';
import {
  candleStartOf,
  type PionexKlineInterval,
} from '../pionex/pionex.types';

import { QuantMarketService } from './quant-market.service';

export const QUANT_CANDLE_EVENT = 'quant.candle';

export interface QuantCandleEvent {
  candle: QuantCandleDto;
  interval: PionexKlineInterval;
  symbol: string;
}

interface CandleWatch {
  candle: QuantCandleDto | null;
  interval: PionexKlineInterval;
  refs: number;
}

// Pionex WS 沒有 K 線 topic，當根 K 線由成交即時聚合
@Injectable()
export class QuantMarketStreamService {
  private readonly candleWatches = new Map<string, Map<string, CandleWatch>>();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly market: QuantMarketService,
    private readonly publicStream: PionexPublicStream,
    private readonly symbols: PionexSymbolsService,
  ) {}

  async watch(
    symbol: string,
    interval: PionexKlineInterval,
  ): Promise<() => void> {
    const [[latest], type] = await Promise.all([
      this.market.findCandles(symbol, interval, 1) as Promise<
        [QuantCandleDto?]
      >,
      this.symbols.marketTypeOf(symbol),
    ]);

    const releaseSymbol = this.publicStream.subscribe(symbol, type);

    const watches =
      this.candleWatches.get(symbol) ?? new Map<string, CandleWatch>();
    this.candleWatches.set(symbol, watches);
    const watch: CandleWatch = watches.get(interval) ?? {
      candle: null,
      interval,
      refs: 0,
    };
    watch.refs++;
    if (!watch.candle || (latest && latest.time >= watch.candle.time))
      watch.candle = latest ?? null;
    watches.set(interval, watch);

    let released = false;

    return () => {
      if (released) return;
      released = true;

      releaseSymbol();
      if (--watch.refs > 0) return;
      watches.delete(interval);
      if (!watches.size) this.candleWatches.delete(symbol);
    };
  }

  @OnEvent(PIONEX_TRADES_EVENT)
  handleTrades({ symbol, trades }: PionexTradesEvent) {
    const watches = this.candleWatches.get(symbol);
    if (!watches) return;

    const ordered = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    for (const watch of watches.values()) {
      if (!watch.candle) continue;

      for (const trade of ordered) {
        const price = Number(trade.price);
        const size = Number(trade.size);
        const bucket = candleStartOf(watch.interval, trade.timestamp);

        if (bucket < watch.candle.time) continue;
        if (bucket > watch.candle.time)
          watch.candle = {
            close: price,
            high: price,
            low: price,
            open: price,
            time: bucket,
            volume: size,
          };
        else
          watch.candle = {
            ...watch.candle,
            close: price,
            high: Math.max(watch.candle.high, price),
            low: Math.min(watch.candle.low, price),
            volume: watch.candle.volume + size,
          };
      }

      this.eventEmitter.emit(QUANT_CANDLE_EVENT, {
        candle: watch.candle,
        interval: watch.interval,
        symbol,
      } satisfies QuantCandleEvent);
    }
  }
}
