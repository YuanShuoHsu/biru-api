import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { QuantMarketService } from '../market/quant-market.service';
import {
  PIONEX_DEPTH_EVENT,
  PIONEX_INDEX_EVENT,
  PIONEX_TRADES_EVENT,
  type PionexDepthEvent,
  type PionexIndexEvent,
  type PionexTradesEvent,
} from '../pionex/pionex-public-stream';

import { walkDepth } from './simulated-broker';
import type { OrderSide } from './types';

type Levels = [price: number, size: number][];

// 推播最多 100 檔，REST 最多約 1000 檔
const FULL_DEPTH_LEVELS = 1000;
// 標記價格推播大約每秒一次；超過這個時間沒收到代表沒人訂閱，改打 REST
const MARK_PRICE_MAX_AGE_MS = 5000;

// 模擬盤市價單要用委託簿逐檔吃單估算滑價
@Injectable()
export class MarketCacheService {
  private readonly depths = new Map<string, { asks: Levels; bids: Levels }>();
  private readonly prices = new Map<string, number>();
  private readonly markPrices = new Map<
    string,
    { at: number; price: number }
  >();

  constructor(private readonly market: QuantMarketService) {}

  lastPrice(symbol: string) {
    return this.prices.get(symbol) ?? null;
  }

  setLastPrice(symbol: string, price: number) {
    this.prices.set(symbol, price);
  }

  async averagePrice(
    symbol: string,
    side: OrderSide,
    quantity: { amount?: number; size?: number },
  ) {
    const cached = this.depths.get(symbol);
    const cachedLevels = side === 'BUY' ? cached?.asks : cached?.bids;
    const price = cachedLevels && walkDepth(cachedLevels, quantity);
    if (price) return price;

    const full = await this.market.findDepth(symbol, FULL_DEPTH_LEVELS);

    return walkDepth(side === 'BUY' ? full.asks : full.bids, quantity);
  }

  async markPrice(symbol: string) {
    const cached = this.markPrices.get(symbol);
    if (cached && Date.now() - cached.at < MARK_PRICE_MAX_AGE_MS)
      return cached.price;

    return Number((await this.market.findPerpIndex(symbol)).markPrice);
  }

  @OnEvent(PIONEX_INDEX_EVENT)
  handleIndex({ markPrice, symbol }: PionexIndexEvent) {
    this.markPrices.set(symbol, { at: Date.now(), price: Number(markPrice) });
  }

  /** 推播快取的前幾檔；還沒收到推播時回頭打 REST */
  async topLevels(symbol: string, levels: number) {
    const cached = this.depths.get(symbol);
    const depth = cached ?? (await this.market.findDepth(symbol, levels));

    return {
      asks: depth.asks.slice(0, levels),
      bids: depth.bids.slice(0, levels),
    };
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
