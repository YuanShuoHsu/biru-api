import { Injectable } from '@nestjs/common';

import type { SymbolSpec } from '../engine/types';
import {
  type PionexCredentials,
  PionexRestClient,
} from '../pionex/pionex-rest.client';

// https://www.pionex.com/docs/api-docs/bot-api/signal
export interface PionexUserSignal {
  description?: string;
  signalType: string;
  title: string;
  tradingviewConfig?: { message: string; webhookUrl: string };
}

// https://www.pionex.com/docs/api-docs/bot-api/smart-copy
// 文件的回應範例是 snake_case，實際回傳是 camelCase
export interface PionexSmartCopyCheck {
  availableLimit?: string;
  maxInvestment?: string;
  maxLeverage?: string;
  notionalLimit?: string;
}

export interface PionexSmartCopyPortfolioItem {
  amountLong?: string;
  amountShort?: string;
  fundingFee?: string;
  leverage?: number;
  maintPrice?: string;
  profit?: string;
  qtyLong?: string;
  qtyShort?: string;
  totalFeeInQuote?: string;
}

export interface PionexSmartCopyData {
  currentQuoteAmount?: string;
  fundingFee?: string;
  portfolio?: PionexSmartCopyPortfolioItem[];
  profit?: string;
  quoteTotalInvestment?: string;
  reasonBy?: string;
  status: string;
}

export interface PionexSmartCopyOrder {
  buOrderData: PionexSmartCopyData;
  buOrderId: string;
  status: string;
}

export interface SmartCopyParams {
  compound: boolean;
  investment: string;
  leverage: number;
  /** 例如 -0.2 代表虧損 20% 時平倉 */
  lossStopRatio?: string;
  /** 例如 0.5 代表獲利 50% 時平倉 */
  profitStopRatio?: string;
  signalType: string;
}

export interface SignalPush {
  action: 'buy' | 'sell';
  contracts: string;
  positionSize: string;
  price: string;
  signalType: string;
}

@Injectable()
export class PionexSignalService {
  constructor(private readonly rest: PionexRestClient) {}

  createSignal(
    credentials: PionexCredentials,
    title: string,
    description: string,
  ) {
    return this.rest.signed<PionexUserSignal>(
      credentials,
      'POST',
      '/api/v1/bot/signal/userSignal',
      { body: { description, title } },
    );
  }

  getSignal(credentials: PionexCredentials, signalType: string) {
    return this.rest.signed<PionexUserSignal>(
      credentials,
      'GET',
      '/api/v1/bot/signal/userSignal/detail',
      { params: { signalType } },
    );
  }

  async deleteSignal(credentials: PionexCredentials, signalType: string) {
    await this.rest.signed(
      credentials,
      'DELETE',
      '/api/v1/bot/signal/userSignal/delete',
      { params: { signalType } },
    );
  }

  async push(
    credentials: PionexCredentials,
    spec: SymbolSpec,
    { action, contracts, positionSize, price, signalType }: SignalPush,
  ) {
    await this.rest.signed(credentials, 'POST', '/api/v1/bot/signal/listener', {
      body: {
        base: spec.base,
        data: { action, contracts, position_size: positionSize },
        price,
        quote: spec.quote,
        signalParam: '{}',
        signalType,
        time: new Date().toISOString(),
      },
    });
  }

  checkSmartCopy(
    credentials: PionexCredentials,
    spec: SymbolSpec,
    { investment, leverage, signalType }: SmartCopyParams,
  ) {
    return this.rest.signed<PionexSmartCopyCheck>(
      credentials,
      'POST',
      '/api/v1/bot/orders/smartCopy/checkParams',
      {
        body: {
          base: spec.base,
          leverage,
          quote: spec.quote,
          quote_investment: investment,
          signal_param: '{}',
          signal_type: signalType,
        },
      },
    );
  }

  createSmartCopy(
    credentials: PionexCredentials,
    spec: SymbolSpec,
    params: SmartCopyParams,
    note: string,
  ) {
    return this.rest.signed<{ bu_order_id: string }>(
      credentials,
      'POST',
      '/api/v1/bot/orders/smartCopy/create',
      {
        body: {
          base: spec.base,
          bu_order_data: {
            compound: params.compound,
            portfolio: [
              {
                base: spec.base,
                leverage: params.leverage,
                percent: '1',
                signal_param: '{}',
                signal_type: params.signalType,
                ...(params.lossStopRatio && {
                  loss_stop_ratio: params.lossStopRatio,
                }),
                ...(params.profitStopRatio && {
                  profit_stop_ratio: params.profitStopRatio,
                }),
              },
            ],
            quote_total_investment: params.investment,
          },
          note,
          quote: spec.quote,
        },
      },
    );
  }

  getSmartCopy(credentials: PionexCredentials, buOrderId: string) {
    return this.rest.signed<PionexSmartCopyOrder>(
      credentials,
      'GET',
      '/api/v1/bot/orders/smartCopy/order',
      { params: { buOrderId } },
    );
  }

  async cancelSmartCopy(credentials: PionexCredentials, buOrderId: string) {
    await this.rest.signed(
      credentials,
      'POST',
      '/api/v1/bot/orders/smartCopy/cancel',
      { body: { bu_order_id: buOrderId } },
    );
  }
}
