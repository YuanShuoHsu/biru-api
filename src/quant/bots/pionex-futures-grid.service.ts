import { Injectable } from '@nestjs/common';

import type { FuturesGridConfigDto } from '../dto/quant-bot.dto';
import { toDecimalString } from '../engine/precision';
import type { SymbolSpec } from '../engine/types';
import {
  type PionexCredentials,
  PionexRestClient,
} from '../pionex/pionex-rest.client';

import { toPionexStop } from './pionex-grid.service';

// https://www.pionex.com/docs/api-docs/bot-api/futures-grid
// 文件的回應範例是 snake_case，實際回傳是 camelCase
export interface PionexFuturesGridCheck {
  estimateLiquidationPriceDown?: string;
  estimateLiquidationPriceUp?: string;
  estimatePerVolume?: string;
  maxInvestment?: string;
  minInvestment?: string;
  slippage?: string;
}

// 文件沒列出 marginBalance、gridProfit、profitWithdrawn、totalFundingFee、usdtInvestment，實際回傳有
// marginBalance＝投入＋額外保證金＋已實現損益＋資金費＋手續費−已提取利潤（已用實際回應逐項核對）
export interface PionexFuturesGridData {
  bottom?: string;
  buOrderId?: string;
  extraMargin?: string;
  gridType?: 'arithmetic' | 'geometric';
  leverage?: string;
  lossStop?: string | null;
  lossStopHigh?: string | null;
  lossStopLimitHighPrice?: string | null;
  lossStopLimitPrice?: string | null;
  lossStopType?: string;
  profitStop?: string | null;
  profitStopLimitPrice?: string | null;
  profitStopType?: string;
  quoteInvestment?: string;
  row?: number;
  top?: string;
  trend?: 'long' | 'short' | 'no_trend';
  estimateLiquidationPriceDown?: string | null;
  estimateLiquidationPriceUp?: string | null;
  gridProfit?: string;
  liquidationPrice?: string;
  marginBalance?: string;
  position?: string;
  positionOpenPrice?: string;
  profitWithdrawn?: string;
  reasonBy?: string;
  slippage?: string;
  status: string;
  totalFundingFee?: string;
  usdtInvestment?: string;
}

export interface PionexFuturesGridOrder {
  buOrderData: PionexFuturesGridData;
  buOrderId?: string;
  status?: string;
}

// 建立的回應只有 buOrderData，id 在裡面；查詢的回應兩層都有
export const futuresGridIdOf = ({
  buOrderData,
  buOrderId,
}: PionexFuturesGridOrder) => buOrderId ?? buOrderData.buOrderId;

/** 各種調整的試算結果，欄位依操作而不同 */
export interface PionexFuturesGridOperationCheck {
  checkResult: boolean;
  estimateLiquidationPriceDown?: string;
  estimateLiquidationPriceDownAfter?: string;
  estimateLiquidationPriceDownBefore?: string;
  estimateLiquidationPriceUp?: string;
  estimateLiquidationPriceUpAfter?: string;
  estimateLiquidationPriceUpBefore?: string;
  estimatePerVolume?: string;
  maxAmount?: string;
  maxInvestment?: string;
  maxReduceNum?: number;
  minInvestment?: string;
  reason?: string;
  reduceAmount?: string;
  reducePnl?: string;
}

export const PIONEX_FUTURES_GRID_CLOSING = 'close_position';

// 合約網格以 BTC.PERP／USDT 表示交易對，和行情的 BTC_USDT_PERP 不同
const botBase = (spec: SymbolSpec) => `${spec.base}.PERP`;

@Injectable()
export class PionexFuturesGridService {
  constructor(private readonly rest: PionexRestClient) {}

  checkParams(
    credentials: PionexCredentials,
    spec: SymbolSpec,
    config: FuturesGridConfigDto,
    investment: number,
  ) {
    const price = (value: number) =>
      toDecimalString(value, spec.pricePrecision);
    const amount = (value: number) =>
      toDecimalString(value, spec.amountPrecision);

    return this.rest.signed<PionexFuturesGridCheck>(
      credentials,
      'POST',
      '/api/v1/bot/orders/futuresGrid/checkParams',
      {
        body: {
          base: botBase(spec),
          buOrderData: {
            bottom: price(config.bottom),
            extra_margin: false,
            ...(config.extraMargin && {
              extra_margin_amount: amount(config.extraMargin),
            }),
            grid_type: config.gridType,
            leverage: config.leverage,
            quote_investment: amount(investment),
            row: config.row,
            top: price(config.top),
            trend: config.trend,
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

  create(
    credentials: PionexCredentials,
    spec: SymbolSpec,
    config: FuturesGridConfigDto,
    investment: number,
  ) {
    const price = (value: number) =>
      toDecimalString(value, spec.pricePrecision);
    const amount = (value: number) =>
      toDecimalString(value, spec.amountPrecision);
    const { lossStop, profitStop } = config;

    return this.rest.signed<PionexFuturesGridOrder>(
      credentials,
      'POST',
      '/api/v1/bot/orders/futuresGrid/create',
      {
        body: {
          base: botBase(spec),
          buOrderData: {
            bottom: price(config.bottom),
            ...(config.extraMargin && {
              extraMargin: amount(config.extraMargin),
            }),
            grid_type: config.gridType,
            leverage: config.leverage,
            quoteInvestment: amount(investment),
            row: config.row,
            ...(config.slippage && {
              slippage: toDecimalString(config.slippage / 100, 6),
            }),
            top: price(config.top),
            trend: config.trend,
            ...(lossStop && {
              lossStop: toPionexStop(lossStop, 'loss', spec),
              lossStopType: lossStop.type,
              ...(lossStop.limitPrice && {
                lossStopLimitPrice: price(lossStop.limitPrice),
              }),
            }),
            ...(config.lossStopHigh && {
              lossStopHigh: price(config.lossStopHigh),
            }),
            ...(lossStop?.type === 'price_limit' &&
              config.lossStopLimitHigh && {
                lossStopLimitHighPrice: price(config.lossStopLimitHigh),
              }),
            ...(profitStop && {
              profitStop: toPionexStop(profitStop, 'profit', spec),
              profitStopType: profitStop.type,
              ...(profitStop.limitPrice && {
                profitStopLimitPrice: price(profitStop.limitPrice),
              }),
            }),
            ...(config.trigger && {
              condition: price(config.trigger.price),
              conditionDirection:
                config.trigger.direction === 'above' ? '1' : '-1',
            }),
          },
          quote: spec.quote,
        },
      },
    );
  }

  get(credentials: PionexCredentials, buOrderId: string) {
    return this.rest.signed<PionexFuturesGridOrder>(
      credentials,
      'GET',
      '/api/v1/bot/orders/futuresGrid/order',
      { params: { buOrderId } },
    );
  }

  // 試算端點是在操作路徑後面加 Check；updateTriggerProfitLoss 沒有試算
  operate(
    credentials: PionexCredentials,
    path: FuturesGridOperationPath,
    body: object,
    dryRun: boolean,
  ) {
    return this.rest.signed<PionexFuturesGridOperationCheck | undefined>(
      credentials,
      'POST',
      `/api/v1/bot/orders/futuresGrid/${dryRun ? `${path}Check` : path}`,
      { body },
    );
  }

  async updateStops(credentials: PionexCredentials, body: object) {
    await this.rest.signed(
      credentials,
      'POST',
      '/api/v1/bot/orders/futuresGrid/updateTriggerProfitLoss',
      { body },
    );
  }

  async cancel(credentials: PionexCredentials, buOrderId: string) {
    const { buOrderData } = await this.get(credentials, buOrderId);

    // immediate 只救「限價停利停損已觸發、平倉單未成交」而卡在平倉中的單（改以市價平倉），其他狀態帶 true 會被拒
    await this.rest.signed(
      credentials,
      'POST',
      '/api/v1/bot/orders/futuresGrid/cancel',
      {
        body: {
          buOrderId,
          ...(buOrderData.status === PIONEX_FUTURES_GRID_CLOSING && {
            immediate: true,
          }),
        },
      },
    );
  }
}

export type FuturesGridOperationPath =
  | 'addMargin'
  | 'adjustParams'
  | 'pause'
  | 'reduce'
  | 'reduceMargin'
  | 'resume';
