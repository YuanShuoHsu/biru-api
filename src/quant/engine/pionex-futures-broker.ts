import { setTimeout as sleep } from 'node:timers/promises';

import {
  PionexApiError,
  type PionexCredentials,
  type PionexRestClient,
} from '../pionex/pionex-rest.client.js';
import type {
  PionexFuturesFill,
  PionexFuturesOrder,
  PionexPosition,
  PionexPositionMode,
} from '../pionex/pionex.types.js';

import type { Broker, SubmittedOrder } from './bot-session.js';
import type { SyncedOrder } from './pionex-broker.js';
import { toDecimalString } from './precision.js';
import type { BotFill, SymbolSpec } from './types.js';

const FILL_POLL_ATTEMPTS = 10;
const FILL_POLL_MS = 500;

interface FuturesPositionSetting {
  direction: 'long' | 'short';
  mode: PionexPositionMode;
}

// 只下市價單：單向持倉用 BOTH，平倉帶只減倉避免反向開出新倉；雙向持倉依機器人方向用 LONG／SHORT
export class PionexFuturesBroker implements Broker {
  constructor(
    private readonly rest: PionexRestClient,
    private readonly credentials: PionexCredentials,
    private readonly spec: SymbolSpec,
    private readonly hasLease: () => boolean,
    private readonly setting: FuturesPositionSetting,
  ) {}

  async submit(order: SubmittedOrder): Promise<BotFill[]> {
    if (!this.hasLease()) throw new Error('Engine lease lost');
    if (order.type !== 'MARKET' || order.size === undefined)
      throw new Error('Live futures bots only place market orders by size');

    const long = this.setting.direction === 'long';
    const opening = order.side === (long ? 'BUY' : 'SELL');
    const hedge = this.setting.mode === 'OPENCLOSE';

    await this.rest.signed(this.credentials, 'POST', '/uapi/v1/trade/order', {
      body: {
        clientOrderId: order.clientOrderId,
        positionSide: hedge ? (long ? 'LONG' : 'SHORT') : 'BOTH',
        side: order.side,
        size: toDecimalString(order.size, this.spec.sizePrecision),
        symbol: this.spec.symbol,
        type: 'MARKET_QTY',
        ...(!hedge && !opening && { reduceOnly: true }),
      },
    });

    // 合約下單是非同步的，收單後才查得到；等不到成交就交給定期對帳
    for (let attempt = 0; attempt < FILL_POLL_ATTEMPTS; attempt++) {
      await sleep(FILL_POLL_MS);
      const synced = await this.sync(order, new Set()).catch((error) => {
        if (error instanceof PionexApiError) return null;
        throw error;
      });
      if (synced && synced.order.status !== 'open') {
        Object.assign(order, synced.order);
        return synced.fills;
      }
    }

    return [];
  }

  // 市價單送出後幾乎立即成交，沒有可撤的掛單；查得到已結束就視為完成
  async cancel(order: SubmittedOrder): Promise<void> {
    const { order: current } = await this.sync(order, new Set());
    if (current.status === 'open' && current.exchangeOrderId)
      await this.rest.signed(
        this.credentials,
        'DELETE',
        '/uapi/v1/trade/order',
        {
          body: `{"symbol":${JSON.stringify(this.spec.symbol)},"orderId":${current.exchangeOrderId}}`,
        },
      );
  }

  async sync(
    order: SubmittedOrder,
    knownFillIds: ReadonlySet<string>,
  ): Promise<SyncedOrder> {
    const exchange = await this.rest.signed<PionexFuturesOrder>(
      this.credentials,
      'GET',
      '/uapi/v1/trade/orderByClientOrderId',
      {
        params: {
          clientOrderId: order.clientOrderId,
          symbol: this.spec.symbol,
        },
      },
    );
    const filledSize = Number(exchange.filledSize);

    const fills =
      filledSize > order.filledSize
        ? (
            await this.rest.signed<{ fills: PionexFuturesFill[] }>(
              this.credentials,
              'GET',
              '/uapi/v1/trade/fillsByOrderId',
              {
                params: { orderId: exchange.orderId, symbol: this.spec.symbol },
              },
            )
          ).fills
            .filter(({ id }) => !knownFillIds.has(`pionex:${id}`))
            .map((fill) => this.toFill(order.id, fill))
        : [];

    return {
      fills,
      order: {
        exchangeOrderId: exchange.orderId,
        filledAmount: Number(exchange.filledAmount),
        filledSize,
        // 只減倉的單可能被交易所縮量，size 是縮量後的實際數量
        status:
          exchange.status === 'OPEN'
            ? 'open'
            : filledSize > 0 && filledSize >= Number(exchange.size)
              ? 'filled'
              : 'canceled',
      },
    };
  }

  /** 交易所上這個機器人方向的淨持倉，做空為負數 */
  async position(): Promise<number> {
    const { positions } = await this.rest.signed<{
      positions: PionexPosition[];
    }>(this.credentials, 'GET', '/uapi/v1/account/positions', {
      params: { symbol: this.spec.symbol },
    });
    const side = this.setting.direction === 'long' ? 'LONG' : 'SHORT';

    return positions
      .filter(
        (position) =>
          position.symbol === this.spec.symbol &&
          (this.setting.mode === 'BUYSELL' || position.positionSide === side),
      )
      .reduce((sum, { netSize }) => sum + Number(netSize), 0);
  }

  private toFill(orderId: string, fill: PionexFuturesFill): BotFill {
    return {
      // 文件沒寫正負號；市價單一定是吃單，手續費一律是支出
      fee: Math.abs(Number(fill.fee)),
      feeAsset: 'quote',
      id: `pionex:${fill.id}`,
      orderId,
      price: Number(fill.price),
      side: fill.side,
      size: Number(fill.size),
      time: fill.timestamp,
    };
  }
}
