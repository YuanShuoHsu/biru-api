import { Injectable } from '@nestjs/common';

import type { GridConfigDto } from '../dto/quant-bot.dto';
import { toDecimalString } from '../engine/precision';
import type { SymbolSpec } from '../engine/types';
import {
  type PionexCredentials,
  PionexRestClient,
} from '../pionex/pionex-rest.client';

// https://www.pionex.com/docs/api-docs/bot-api/spot-grid
export interface PionexSpotGridData {
  averageCost?: string;
  baseAmount?: string;
  gridProfit?: string;
  quoteAmount?: string;
  quoteTotalInvestment?: string;
  realizedProfit?: string;
  reasonBy?: string;
  status: string;
}

export interface PionexSpotGridOrder {
  buOrderData: PionexSpotGridData;
  buOrderId: string;
  status: string;
}

export interface PionexSpotGridAiStrategy {
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

/** Pionex 內建網格已結束（使用者停止、停損停利或建立失敗） */
export const PIONEX_GRID_FINISHED = 'canceled';

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
    const stop = (stopConfig?: GridConfigDto['lossStop']) =>
      stopConfig && {
        type: stopConfig.type,
        value:
          stopConfig.type === 'price'
            ? price(stopConfig.value)
            : toDecimalString(stopConfig.value, spec.amountPrecision),
      };
    const lossStop = stop(config.lossStop);
    const profitStop = stop(config.profitStop);

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
            ...(lossStop && {
              lossStop: lossStop.value,
              lossStopType: lossStop.type,
            }),
            ...(profitStop && {
              profitStop: profitStop.value,
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

  aiStrategy(credentials: PionexCredentials, spec: SymbolSpec) {
    return this.rest.signed<PionexSpotGridAiStrategy>(
      credentials,
      'GET',
      '/api/v1/bot/orders/spotGrid/aiStrategy',
      { params: { base: spec.base, quote: spec.quote } },
    );
  }
}
