import { BadRequestException, Injectable } from '@nestjs/common';

import { I18nContext, I18nService } from 'nestjs-i18n';
import { randomUUID } from 'node:crypto';

import type { I18nTranslations } from 'src/generated/i18n.generated';

import type {
  AdjustIsolatedMarginDto,
  PlaceFuturesOrderDto,
  QuantFundingFeeDto,
  QuantFuturesAccountDto,
  QuantFuturesFillDto,
  QuantFuturesOrderDto,
  PreviewFuturesOrderDto,
  QuantFuturesOrderPreviewDto,
  QuantFuturesSymbolSettingsDto,
  QuantPositionDto,
  QuantPositionHistoryDto,
} from '../dto/quant-futures.dto';
import type { PlaceQuantOrderResponseDto } from '../dto/quant-account.dto';
import { FuturesAccount } from '../engine/futures-account';
import { toRiskTiers } from '../engine/symbol-spec';
import { MarketCacheService } from '../engine/market-cache.service';
import {
  type PionexCredentials,
  PionexRestClient,
} from '../pionex/pionex-rest.client';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service';
import type {
  PionexFundingFee,
  PionexFuturesBalance,
  PionexFuturesFill,
  PionexFuturesOrder,
  PionexHistoryPosition,
  PionexMarginMode,
  PionexPosition,
  PionexPositionMode,
} from '../pionex/pionex.types';

import { QuantAccountService } from './quant-account.service';

// 合約端點的權重一律是 5
const FUTURES_WEIGHT = 5;
const HISTORY_LIMIT = 50;

const toOrder = (order: PionexFuturesOrder): QuantFuturesOrderDto => ({
  createTime: order.createTime,
  filledAmount: Number(order.filledAmount),
  filledSize: Number(order.filledSize),
  orderId: order.orderId,
  positionSide: order.positionSide,
  price: order.type === 'MARKET_QTY' ? undefined : Number(order.price),
  reduceOnly: order.reduceOnly,
  side: order.side,
  size: Number(order.origSize || order.size),
  status: order.status,
  symbol: order.symbol,
  type: order.type,
  updateTime: order.updateTime,
});

const toFill = (fill: PionexFuturesFill): QuantFuturesFillDto => ({
  fee: Number(fill.fee),
  feeCoin: fill.feeCoin,
  feeType: fill.feeType,
  id: fill.id,
  orderId: fill.orderId,
  price: Number(fill.price),
  role: fill.role,
  side: fill.side,
  size: Number(fill.size),
  time: fill.timestamp,
});

const toPosition = (position: PionexPosition): QuantPositionDto => ({
  avgPrice: Number(position.avgPrice),
  createTime: position.createTime,
  initialMargin: Number(position.initialMargin),
  isolatedMode: position.isolatedMode,
  leverage: Number(position.leverage),
  liquidationPrice: Number(position.liquidationPrice),
  maintMargin: Number(position.maintMargin),
  markPrice: Number(position.markPrice),
  positionId: position.positionId,
  positionSide: position.positionSide,
  size: Number(position.netSize),
  symbol: position.symbol,
  unrealizedPnL: Number(position.unrealizedPnL),
});

// 欄位定義見 https://www.pionex.com/docs/api-docs/futures-api/models
const toPositionHistory = (
  position: PionexHistoryPosition,
): QuantPositionHistoryDto => {
  const sizeLong = Number(position.sizeLong);
  const sizeShort = Math.abs(Number(position.sizeShort));
  const priceOf = (amount: string, size: number) =>
    size ? Math.abs(Number(amount)) / size : 0;
  const isLong = position.positionSide === 'LONG';

  return {
    closePrice: isLong
      ? priceOf(position.amountShort, sizeShort)
      : priceOf(position.amountLong, sizeLong),
    closeTime: position.updateTime,
    createTime: position.createTime,
    isolatedMode: position.isolatedMode,
    leverage: Number(position.leverage),
    liquidated: Number(position.sizeLiquidated) !== 0,
    openPrice: isLong
      ? priceOf(position.amountLong, sizeLong)
      : priceOf(position.amountShort, sizeShort),
    positionId: position.positionId,
    positionSide: position.positionSide,
    realizedPnL:
      Number(position.amountLong) +
      Number(position.amountShort) +
      Number(position.amountSettled),
    size: isLong ? sizeLong : sizeShort,
    symbol: position.symbol,
  };
};

@Injectable()
export class QuantFuturesService {
  constructor(
    private readonly account: QuantAccountService,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly marketCache: MarketCacheService,
    private readonly rest: PionexRestClient,
    private readonly symbols: PionexSymbolsService,
  ) {}

  private t(
    key: 'orderFieldsFuturesLimit',
    args?: Record<string, unknown>,
  ): string {
    return this.i18n.t(`common.quant.${key}`, {
      args,
      lang: I18nContext.current()?.lang,
    });
  }

  private async get<T>(
    userId: string,
    id: string,
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    return this.account.withExchangeError(async () =>
      this.rest.signed<T>(
        await this.account.resolveCredentials(userId, id),
        'GET',
        path,
        { params, weight: FUTURES_WEIGHT },
      ),
    );
  }

  private async post<T>(
    credentials: PionexCredentials,
    method: 'POST' | 'DELETE',
    path: string,
    body: object | string,
  ): Promise<T> {
    return this.account.translateOrderError(() =>
      this.rest.signed<T>(credentials, method, path, {
        body,
        weight: FUTURES_WEIGHT,
      }),
    );
  }

  async findAccount(
    userId: string,
    id: string,
  ): Promise<QuantFuturesAccountDto> {
    const [{ balances }, { positionMode }] = await Promise.all([
      this.get<{ balances: PionexFuturesBalance[] }>(
        userId,
        id,
        '/uapi/v1/account/detail',
      ),
      this.get<{ positionMode: PionexPositionMode }>(
        userId,
        id,
        '/uapi/v1/account/positionMode',
      ),
    ]);

    return {
      balances: balances
        .filter(({ assets }) => Number(assets) !== 0)
        .map((balance) => ({
          assets: Number(balance.assets),
          available: Number(balance.available),
          coin: balance.coin,
          totalInitialMargin: Number(balance.totalInitialMargin),
          transferable: Number(balance.transferable),
          unrealizedPnL: Number(balance.unrealizedPnL),
        })),
      positionMode,
    };
  }

  async findSymbolSettings(
    userId: string,
    id: string,
    symbol: string,
  ): Promise<QuantFuturesSymbolSettingsDto> {
    await this.symbols.getPerp(symbol);
    // 文件寫回傳 {symbol, leverage}，實測是 {leverages: [{symbol, leverage}]}
    const [{ leverages }, { isolatedMode }] = await Promise.all([
      this.get<{ leverages: { leverage: string; symbol: string }[] }>(
        userId,
        id,
        '/uapi/v1/account/leverage',
        { symbol },
      ),
      this.get<{ isolatedMode: PionexMarginMode }>(
        userId,
        id,
        '/uapi/v1/trade/isolatedMode',
        { symbol },
      ),
    ]);

    return {
      leverage: Number(
        leverages.find((item) => item.symbol === symbol)?.leverage,
      ),
      marginMode: isolatedMode,
      symbol,
    };
  }

  async setLeverage(
    userId: string,
    id: string,
    symbol: string,
    leverage: number,
  ): Promise<void> {
    await this.symbols.getPerp(symbol);
    await this.post(
      await this.account.resolveCredentials(userId, id),
      'POST',
      '/uapi/v1/account/leverage',
      { leverage: String(leverage), symbol },
    );
  }

  async setMarginMode(
    userId: string,
    id: string,
    symbol: string,
    marginMode: PionexMarginMode,
  ): Promise<void> {
    await this.symbols.getPerp(symbol);
    await this.post(
      await this.account.resolveCredentials(userId, id),
      'POST',
      '/uapi/v1/trade/isolatedMode',
      { isolatedMode: marginMode, symbol },
    );
  }

  async setPositionMode(
    userId: string,
    id: string,
    positionMode: PionexPositionMode,
  ): Promise<void> {
    await this.post(
      await this.account.resolveCredentials(userId, id),
      'POST',
      '/uapi/v1/account/positionMode',
      { positionMode },
    );
  }

  async adjustIsolatedMargin(
    userId: string,
    id: string,
    { amount, direction, isolatedMode, symbol }: AdjustIsolatedMarginDto,
  ): Promise<void> {
    const { quoteCurrency } = await this.symbols.getPerp(symbol);
    await this.post(
      await this.account.resolveCredentials(userId, id),
      'POST',
      '/uapi/v1/trade/isolateMargin',
      {
        amount,
        clientId: randomUUID(),
        coin: quoteCurrency,
        direction,
        isolatedMode,
        symbol,
      },
    );
  }

  async listPositions(
    userId: string,
    id: string,
    symbol?: string,
  ): Promise<QuantPositionDto[]> {
    const { positions } = await this.get<{ positions: PionexPosition[] }>(
      userId,
      id,
      '/uapi/v1/account/positions',
      { symbol },
    );

    return positions.map(toPosition);
  }

  async listPositionHistory(
    userId: string,
    id: string,
    symbol?: string,
  ): Promise<QuantPositionHistoryDto[]> {
    const { positions } = await this.get<{
      positions: PionexHistoryPosition[];
    }>(userId, id, '/uapi/v1/account/historyPositions', {
      limit: HISTORY_LIMIT,
      symbol,
    });

    return positions.map(toPositionHistory);
  }

  async listOpenOrders(
    userId: string,
    id: string,
    symbol?: string,
  ): Promise<QuantFuturesOrderDto[]> {
    const { orders } = await this.get<{ orders: PionexFuturesOrder[] }>(
      userId,
      id,
      '/uapi/v1/trade/openOrders',
      { symbol },
    );

    return orders.map(toOrder);
  }

  async listOrders(
    userId: string,
    id: string,
    symbol?: string,
  ): Promise<QuantFuturesOrderDto[]> {
    const { orders } = await this.get<{ orders: PionexFuturesOrder[] }>(
      userId,
      id,
      '/uapi/v1/trade/historyOrders',
      { limit: HISTORY_LIMIT, symbol },
    );

    return orders.map(toOrder);
  }

  async listFills(
    userId: string,
    id: string,
    symbol: string,
  ): Promise<QuantFuturesFillDto[]> {
    const { fills } = await this.get<{ fills: PionexFuturesFill[] }>(
      userId,
      id,
      '/uapi/v1/trade/fills',
      { limit: HISTORY_LIMIT, symbol },
    );

    return fills.map(toFill);
  }

  async listFundingFees(
    userId: string,
    id: string,
    symbol?: string,
  ): Promise<QuantFundingFeeDto[]> {
    const { fundings } = await this.get<{ fundings: PionexFundingFee[] }>(
      userId,
      id,
      '/uapi/v1/trade/fundingFee',
      { limit: HISTORY_LIMIT, symbol },
    );

    return fundings.map((funding) => ({
      coin: funding.fundingCoin,
      fee: Number(funding.fundingFee),
      rate: Number(funding.fundingRate),
      symbol: funding.symbol,
      time: funding.timestamp,
    }));
  }

  async placeOrder(
    userId: string,
    id: string,
    dto: PlaceFuturesOrderDto,
  ): Promise<PlaceQuantOrderResponseDto> {
    return this.submitOrder(userId, id, dto);
  }

  /**
   * 開多與開空成交後的預估強平價。逐倉以該方向倉位自己的保證金計算；全倉把帳戶保證金都算進來，
   * 但不計其他全倉部位的盈虧變動，所以是估計值，實際以成交後交易所回報的強平價為準。
   */
  async previewOrder(
    userId: string,
    id: string,
    { price: limitPrice, size: sizeText, symbol, type }: PreviewFuturesOrderDto,
  ): Promise<QuantFuturesOrderPreviewDto> {
    const [perp, riskTiers, markPrice, symbolSettings, detail] =
      await Promise.all([
        this.symbols.getPerp(symbol),
        this.symbols.riskTiersOf(symbol),
        this.marketCache.markPrice(symbol),
        this.findSymbolSettings(userId, id, symbol),
        this.get<{
          balances: PionexFuturesBalance[];
          positions: PionexPosition[] | null;
        }>(userId, id, '/uapi/v1/account/detail'),
      ]);
    const positions = (detail.positions ?? [])
      .filter((position) => position.symbol === symbol)
      .map(toPosition);
    const size = Number(sizeText);
    const price = type === 'MARKET_QTY' ? markPrice : Number(limitPrice);
    const { leverage, marginMode } = symbolSettings;
    const requiredMargin = (size * price) / leverage;
    const crossBalance = Number(
      detail.balances.find(({ coin }) => coin === perp.quoteCurrency)?.assets ??
        0,
    );

    const estimate = (direction: 'LONG' | 'SHORT') => {
      const existing = positions.find(
        (position) => position.positionSide === direction,
      );
      const simulated = new FuturesAccount({
        investment:
          marginMode === 'ISOLATED'
            ? (existing?.initialMargin ?? 0) + requiredMargin
            : crossBalance,
        leverage,
        liquidationFeeRate: Number(perp.liquidationFeeRate),
        riskTiers: toRiskTiers(riskTiers),
      });
      const side = direction === 'LONG' ? 'BUY' : 'SELL';
      const fill = (fillPrice: number, fillSize: number) =>
        simulated.apply({
          fee: 0,
          feeAsset: 'quote',
          orderId: 'preview',
          price: fillPrice,
          side,
          size: fillSize,
          time: 0,
        });
      if (existing) fill(existing.avgPrice, Math.abs(existing.size));
      fill(price, size);

      const liquidationPrice = simulated.liquidationPrice() ?? undefined;

      return {
        // 從成交價量起；強平價已在成交價另一側代表一成交就會被強平，距離算 0
        liquidationDistance:
          liquidationPrice === undefined
            ? undefined
            : Math.max(
                0,
                ((direction === 'LONG' ? 1 : -1) * (price - liquidationPrice)) /
                  price,
              ),
        liquidationPrice,
      };
    };

    return {
      long: estimate('LONG'),
      markPrice,
      requiredMargin,
      short: estimate('SHORT'),
    };
  }

  private async submitOrder(
    userId: string,
    id: string,
    {
      positionSide,
      price,
      reduceOnly,
      side,
      size,
      symbol,
      type,
    }: PlaceFuturesOrderDto,
  ): Promise<PlaceQuantOrderResponseDto> {
    if (type !== 'MARKET_QTY' && !price)
      throw new BadRequestException(this.t('orderFieldsFuturesLimit'));

    await this.symbols.getPerp(symbol);

    return this.post(
      await this.account.resolveCredentials(userId, id),
      'POST',
      '/uapi/v1/trade/order',
      {
        clientOrderId: `manual-${randomUUID()}`,
        positionSide,
        side,
        size,
        symbol,
        type,
        ...(type === 'MARKET_QTY' ? {} : { price }),
        ...(positionSide === 'BOTH' ? { reduceOnly: !!reduceOnly } : {}),
      },
    );
  }

  async cancelOrder(
    userId: string,
    id: string,
    symbol: string,
    orderId: string,
  ): Promise<void> {
    if (!/^\d+$/.test(orderId)) throw this.account.orderNotFound();

    await this.post(
      await this.account.resolveCredentials(userId, id),
      'DELETE',
      '/uapi/v1/trade/order',
      // orderId 原樣當 JSON 數字送出；轉成 number 超過 2^53 會被改值
      `{"symbol":${JSON.stringify(symbol)},"orderId":${orderId}}`,
    );
  }

  async cancelAllOrders(
    userId: string,
    id: string,
    symbol: string,
  ): Promise<void> {
    await this.post(
      await this.account.resolveCredentials(userId, id),
      'DELETE',
      '/uapi/v1/trade/allOrders',
      { symbol },
    );
  }
}
