import { Logger } from '@nestjs/common';

import {
  PionexApiError,
  type PionexCredentials,
  type PionexRestClient,
} from '../pionex/pionex-rest.client.js';
import type { PionexFill, PionexOrder } from '../pionex/pionex.types.js';

import type { Broker, SubmittedOrder } from './bot-session.js';
import { toDecimalString } from './precision.js';
import type { BotFill, SymbolSpec } from './types.js';

export interface SyncedOrder {
  fills: BotFill[];
  order: Partial<SubmittedOrder>;
}

export class PionexBroker implements Broker {
  private readonly logger = new Logger(PionexBroker.name);

  constructor(
    private readonly rest: PionexRestClient,
    private readonly credentials: PionexCredentials,
    private readonly spec: SymbolSpec,
    private readonly hasLease: () => boolean,
  ) {}

  async submit(order: SubmittedOrder): Promise<BotFill[]> {
    if (!this.hasLease()) throw new Error('Engine lease lost');

    const { orderId } = await this.rest.signed<{ orderId: string }>(
      this.credentials,
      'POST',
      '/api/v1/trade/order',
      {
        body: {
          clientOrderId: order.clientOrderId,
          side: order.side,
          symbol: this.spec.symbol,
          type: order.type,
          ...(order.price !== undefined && {
            price: toDecimalString(order.price, this.spec.pricePrecision),
          }),
          ...(order.size !== undefined && {
            size: toDecimalString(order.size, this.spec.sizePrecision),
          }),
          ...(order.amount !== undefined && {
            amount: toDecimalString(order.amount, this.spec.amountPrecision),
          }),
        },
      },
    );
    order.exchangeOrderId = orderId;

    // 市價單幾乎立即成交，直接對帳帶回成交；限價單等推播或定期對帳
    if (order.type !== 'MARKET') return [];

    const { fills, order: update } = await this.sync(order, new Set());
    Object.assign(order, update);

    return fills;
  }

  async cancel(order: SubmittedOrder): Promise<void> {
    const exchangeOrderId =
      order.exchangeOrderId ??
      (await this.sync(order, new Set())).order.exchangeOrderId;

    try {
      await this.rest.signed(
        this.credentials,
        'DELETE',
        '/api/v1/trade/order',
        {
          body: `{"symbol":${JSON.stringify(this.spec.symbol)},"orderId":${exchangeOrderId}}`,
        },
      );
    } catch (error) {
      // 撤單時訂單可能剛好成交或已撤；查得到已結束就視為完成
      if (!(error instanceof PionexApiError)) throw error;
      const { order: current } = await this.sync(order, new Set());
      if (current.status === 'open') throw error;
    }
  }

  async sync(
    order: SubmittedOrder,
    knownFillIds: ReadonlySet<string>,
  ): Promise<SyncedOrder> {
    const exchange = await this.rest.signed<PionexOrder>(
      this.credentials,
      'GET',
      '/api/v1/trade/orderByClientOrderId',
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
            await this.rest.signed<{ fills: PionexFill[] }>(
              this.credentials,
              'GET',
              '/api/v1/trade/fillsByOrderId',
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
        status: this.statusOf(exchange, filledSize),
      },
    };
  }

  // 市價買單只有金額沒有數量，收單即成交完畢；其餘部分成交後結束的單視為已撤銷
  private statusOf(exchange: PionexOrder, filledSize: number) {
    if (exchange.status === 'OPEN') return 'open';
    if (exchange.type === 'MARKET')
      return filledSize > 0 ? 'filled' : 'canceled';

    return filledSize >= Number(exchange.size) ? 'filled' : 'canceled';
  }

  private toFill(orderId: string, fill: PionexFill): BotFill {
    const feeAsset = fill.feeCoin === this.spec.base ? 'base' : 'quote';
    if (fill.feeCoin !== this.spec.base && fill.feeCoin !== this.spec.quote)
      this.logger.warn(
        `Fee charged in ${fill.feeCoin} for ${this.spec.symbol}; not counted`,
      );

    return {
      fee:
        fill.feeCoin === this.spec.base || fill.feeCoin === this.spec.quote
          ? Number(fill.fee)
          : 0,
      feeAsset,
      id: `pionex:${fill.id}`,
      orderId,
      price: Number(fill.price),
      side: fill.side,
      size: Number(fill.size),
      time: fill.timestamp,
    };
  }
}
