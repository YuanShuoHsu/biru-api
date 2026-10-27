import { Injectable } from '@nestjs/common';

import type {
  FuturesGridStopDto,
  GridConfigDto,
  GridStopDto,
} from '../dto/quant-bot.dto.js';
import { toDecimalString } from '../engine/precision.js';
import type { SymbolSpec } from '../engine/types.js';
import {
  type PionexCredentials,
  PionexRestClient,
} from '../pionex/pionex-rest.client.js';

// https://www.pionex.com/docs/api-docs/bot-api/spot-grid
export interface PionexSpotGridData {
  averageCost?: string;
  baseAmount?: string;
  bottom?: string;
  closeSellModel?: string;
  condition?: string;
  conditionDirection?: '-1' | '1';
  gridProfit?: string;
  gridType?: GridConfigDto['gridType'];
  lossStop?: string | null;
  lossStopType?: string;
  openPrice?: string;
  profitStop?: string | null;
  profitStopType?: string;
  profitWithdrawn?: string;
  quoteAmount?: string;
  quoteTotalInvestment?: string;
  realizedProfit?: string;
  reasonBy?: string;
  row?: number;
  slippage?: string;
  status: string;
  top?: string;
}

interface PionexSpotGridCheck {
  estimateFee?: string;
  estimatePerVolume?: string;
  maxInvestment?: string;
  minInvestment?: string;
}

interface PionexSpotGridOrder {
  buOrderData: PionexSpotGridData;
  buOrderId: string;
  status: string;
}

interface PionexSpotGridAiStrategy {
  annualized: string;
  gridCount: number;
  high: string;
  low: string;
  maxDrawDown: string;
  options?: {
    annualized: string;
    gridCount: number;
    high: string;
    low: string;
    maxDrawDown: string;
    period: number;
  }[];
}

// Pionex 的停損金額與比例是負數（-50、-0.1 = -10%）；本系統一律存正數、比例存 %
export const toPionexStop = (
  stop: FuturesGridStopDto | GridStopDto,
  kind: 'loss' | 'profit',
  spec: SymbolSpec,
) => {
  const sign = kind === 'loss' ? -1 : 1;

  switch (stop.type) {
    case 'price':
    case 'price_limit':
      return toDecimalString(stop.value, spec.pricePrecision);
    case 'profit_amount':
      return toDecimalString(sign * stop.value, spec.amountPrecision);
    case 'profit_ratio':
      return toDecimalString((sign * stop.value) / 100, 6);
  }
};

export const fromPionexStop = (
  type?: string,
  value?: string | null,
  limitPrice?: string | null,
): FuturesGridStopDto | undefined => {
  const number = Math.abs(Number(value || 0));
  if (!number) return undefined;

  switch (type) {
    case 'price':
    case 'profit_amount':
      return { type, value: number };
    case 'profit_ratio':
      return { type, value: Number((number * 100).toPrecision(15)) };
    case 'price_limit':
      return Number(limitPrice)
        ? { limitPrice: Number(limitPrice), type, value: number }
        : undefined;
  }
};

// 現貨網格沒有 price_limit
export const fromPionexSpotStop = (
  type?: string,
  value?: string | null,
): GridStopDto | undefined => {
  const stop = fromPionexStop(type, value);

  return stop && stop.type !== 'price_limit'
    ? { type: stop.type, value: stop.value }
    : undefined;
};

/** Pionex 內建網格已結束（使用者停止、停損停利或建立失敗） */
export const PIONEX_GRID_FINISHED = 'canceled';

// https://www.pionex.com/docs/api-docs/bot-api/bot-orders
// 現貨網格在列表寫 spot_grid、單筆查詢寫 grid_v5
export interface PionexBotOrder {
  base: string;
  botName?: string;
  buOrderId: string;
  buOrderType: string;
  createTime: number;
  customizeName?: string;
  note?: string;
  quote: string;
  status: string;
}

const BOT_LIST_MAX_PAGES = 10;

@Injectable()
export class PionexGridService {
  constructor(private readonly rest: PionexRestClient) {}

  async create(
    credentials: PionexCredentials,
    spec: SymbolSpec,
    config: GridConfigDto,
    investment: number,
    note: string,
  ): Promise<PionexSpotGridOrder> {
    const price = (value: number) =>
      toDecimalString(value, spec.pricePrecision);
    const { lossStop, profitStop } = config;

    return this.rest.signed<PionexSpotGridOrder>(
      credentials,
      'POST',
      '/api/v1/bot/orders/spotGrid/create',
      {
        body: {
          base: spec.base,
          buOrderData: {
            bottom: price(config.bottom),
            closeSellModel: config.closeModel,
            gridType: config.gridType,
            quoteTotalInvestment: toDecimalString(
              investment,
              spec.amountPrecision,
            ),
            row: config.row,
            top: price(config.top),
            ...(config.slippage && {
              slippage: toDecimalString(config.slippage / 100, 6),
            }),
            ...(lossStop && {
              lossStop: toPionexStop(lossStop, 'loss', spec),
              lossStopType: lossStop.type,
            }),
            ...(profitStop && {
              profitStop: toPionexStop(profitStop, 'profit', spec),
              profitStopType: profitStop.type,
            }),
            ...(config.trigger && {
              condition: price(config.trigger.price),
              conditionDirection:
                config.trigger.direction === 'above' ? '1' : '-1',
            }),
          },
          note,
          quote: spec.quote,
        },
      },
    );
  }

  checkParams(
    credentials: PionexCredentials,
    spec: SymbolSpec,
    config: GridConfigDto,
    investment: number,
  ) {
    const price = (value: number) =>
      toDecimalString(value, spec.pricePrecision);

    return this.rest.signed<PionexSpotGridCheck>(
      credentials,
      'POST',
      '/api/v1/bot/orders/spotGrid/checkParams',
      {
        body: {
          base: spec.base,
          buOrderData: {
            bottom: price(config.bottom),
            grid_type: config.gridType,
            quote_total_investment: toDecimalString(
              investment,
              spec.amountPrecision,
            ),
            row: config.row,
            top: price(config.top),
            ...(config.trigger && {
              condition: price(config.trigger.price),
              condition_direction:
                config.trigger.direction === 'above' ? '1' : '-1',
            }),
          },
          quote: spec.quote,
        },
      },
    );
  }

  get(credentials: PionexCredentials, buOrderId: string) {
    return this.rest.signed<PionexSpotGridOrder>(
      credentials,
      'GET',
      '/api/v1/bot/orders/spotGrid/order',
      { params: { buOrderId } },
    );
  }

  async cancel(
    credentials: PionexCredentials,
    buOrderId: string,
    closeModel: GridConfigDto['closeModel'],
  ) {
    await this.rest.signed(
      credentials,
      'POST',
      '/api/v1/bot/orders/spotGrid/cancel',
      { body: { buOrderId, closeSellModel: closeModel } },
    );
  }

  async adjustParams(
    credentials: PionexCredentials,
    body: { bottom: string; buOrderId: string; row: number; top: string },
  ) {
    await this.rest.signed(
      credentials,
      'POST',
      '/api/v1/bot/orders/spotGrid/adjustParams',
      { body },
    );
  }

  async investIn(
    credentials: PionexCredentials,
    buOrderId: string,
    quoteInvest: string,
  ) {
    await this.rest.signed(
      credentials,
      'POST',
      '/api/v1/bot/orders/spotGrid/investIn',
      { body: { buOrderId, quoteInvest } },
    );
  }

  async extractProfit(
    credentials: PionexCredentials,
    buOrderId: string,
    amount: string,
  ) {
    await this.rest.signed(
      credentials,
      'POST',
      '/api/v1/bot/orders/spotGrid/profit',
      { body: { amount, buOrderId } },
    );
  }

  /** 帳戶中執行中的所有 Pionex 機器人，包含在 App 建立的 */
  async listRunningBots(credentials: PionexCredentials) {
    const orders: PionexBotOrder[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < BOT_LIST_MAX_PAGES; page++) {
      const { nextPageToken, results } = await this.rest.signed<{
        nextPageToken?: string | null;
        results?: PionexBotOrder[] | null;
      }>(credentials, 'GET', '/api/v1/bot/orders', {
        params: { pageToken, status: 'running' },
      });
      orders.push(...(results ?? []));
      if (!nextPageToken) break;
      pageToken = nextPageToken;
    }

    return orders;
  }

  aiStrategy(credentials: PionexCredentials, spec: SymbolSpec) {
    return this.rest.signed<PionexSpotGridAiStrategy>(
      credentials,
      'GET',
      '/api/v1/bot/orders/spotGrid/aiStrategy',
      { params: { base: spec.base, quote: spec.quote } },
    );
  }
}
