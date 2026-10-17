import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  PIONEX_DEPTH_EVENT,
  PIONEX_TRADES_EVENT,
  type PionexDepthEvent,
  type PionexTradesEvent,
} from '../pionex/pionex-public-stream';

import { walkDepth } from './simulated-broker';
import type { OrderSide } from './types';

type Levels = [price: number, size: number][];

// 模擬盤市價單要用委託簿逐檔吃單估算滑價
@Injectable()
export class MarketCacheService {
  private readonly depths = new Map<string, { asks: Levels; bids: Levels }>();
  private readonly prices = new Map<string, number>();

  lastPrice(symbol: string) {
    return this.prices.get(symbol) ?? null;
  }

  setLastPrice(symbol: string, price: number) {
    this.prices.set(symbol, price);
  }

  averagePrice(
    symbol: string,
    side: OrderSide,
    quantity: { amount?: number; size?: number },
  ) {
    const depth = this.depths.get(symbol);
    const levels = side === 'BUY' ? depth?.asks : depth?.bids;

    return (levels && walkDepth(levels, quantity)) ?? this.lastPrice(symbol);
  }

  @OnEvent(PIONEX_TRADES_EVENT)
  handleTrades({ symbol, trades }: PionexTradesEvent) {
    const latest = trades.reduce(
      (newest, trade) => (trade.timestamp > newest.timestamp ? trade : newest),
      trades[0],
    );
    if (latest) this.prices.set(symbol, Number(latest.price));
  }

  @OnEvent(PIONEX_DEPTH_EVENT)
  handleDepth({ asks, bids, symbol }: PionexDepthEvent) {
    const toLevels = (levels: PionexDepthEvent['asks']): Levels =>
      levels.map(([price, size]) => [Number(price), Number(size)]);

    this.depths.set(symbol, { asks: toLevels(asks), bids: toLevels(bids) });
  }
}
