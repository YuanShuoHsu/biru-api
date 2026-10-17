import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { randomUUID } from 'node:crypto';

import { decryptField, encryptField } from 'src/common/utils/field-encryption';
import { quantBot, quantBotOrder, quantCredential } from 'src/db/schema/quant';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import type { I18nTranslations } from 'src/generated/i18n.generated';

import type {
  CreateQuantCredentialDto,
  PlaceQuantOrderDto,
  PlaceQuantOrderResponseDto,
  QuantBalanceDto,
  QuantCredentialDto,
  QuantFillDto,
  QuantOrderDto,
} from '../dto/quant-account.dto';
import { isBotClientOrderId } from '../engine/client-order-id';
import { PionexPrivateStreams } from '../pionex/pionex-private-streams';
import {
  PionexApiError,
  type PionexCredentials,
  PionexRestClient,
} from '../pionex/pionex-rest.client';
import { PionexSymbolsService } from '../pionex/pionex-symbols.service';
import type {
  PionexBalance,
  PionexFill,
  PionexOrder,
} from '../pionex/pionex.types';
import { quantEnvironment } from '../quant-environment';

const OPEN_ORDERS_WEIGHT = 5;
const FILLS_WEIGHT = 5;
const ORDER_HISTORY_LIMIT = 50;

// 文件寫 TRADE_ORDER_NOT_FOUND，實測回 TRADE_ORDER_NOT_EXIST
// https://www.pionex.com/docs/api-docs/trade-api/trade
const ORDER_NOT_FOUND_CODES = new Set([
  'TRADE_ORDER_NOT_EXIST',
  'TRADE_ORDER_NOT_FOUND',
]);

// https://pionex-doc.gitbook.io/apidocs/restful/orders/new-order
const KNOWN_ORDER_ERRORS = {
  TRADE_AMOUNT_FILTER_DENIED: 'orderAmountRejected',
  TRADE_SIZE_FILTER_DENIED: 'orderSizeRejected',
} as const;

const isManualOrder = ({ clientOrderId }: PionexOrder) =>
  !isBotClientOrderId(clientOrderId);

const toNumber = (value?: string) =>
  value === undefined || value === '' ? undefined : Number(value);

const toOrder = (order: PionexOrder): QuantOrderDto => ({
  amount: toNumber(order.amount),
  createTime: order.createTime,
  fee: Number(order.fee),
  feeCoin: order.feeCoin,
  filledAmount: Number(order.filledAmount),
  filledSize: Number(order.filledSize),
  orderId: order.orderId,
  price: toNumber(order.price),
  side: order.side,
  size: toNumber(order.size),
  status: order.status,
  symbol: order.symbol,
  type: order.type,
  updateTime: order.updateTime,
});

const toFill = (fill: PionexFill): QuantFillDto => ({
  fee: Number(fill.fee),
  feeCoin: fill.feeCoin,
  id: fill.id,
  orderId: fill.orderId,
  price: Number(fill.price),
  role: fill.role,
  side: fill.side,
  size: Number(fill.size),
  time: fill.timestamp,
});

const toCredentialDto = ({
  apiKeyLast4,
  createdAt,
  id,
  label,
}: typeof quantCredential.$inferSelect): QuantCredentialDto => ({
  apiKeyLast4,
  createdAt,
  id,
  label,
});

@Injectable()
export class QuantAccountService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly privateStreams: PionexPrivateStreams,
    private readonly rest: PionexRestClient,
    private readonly symbols: PionexSymbolsService,
  ) {}

  private t(
    key:
      | 'credentialInvalid'
      | 'credentialNotFound'
      | 'exchangeError'
      | 'exchangeRejected'
      | 'orderAmountRejected'
      | 'orderFieldsMarketBuy'
      | 'orderFieldsMarketSell'
      | 'orderFieldsLimit'
      | 'orderNotFound'
      | 'orderSizeRejected',
    args?: Record<string, unknown>,
  ): string {
    return this.i18n.t(`common.quant.${key}`, {
      args,
      lang: I18nContext.current()?.lang,
    });
  }

  async listCredentials(userId: string): Promise<QuantCredentialDto[]> {
    const rows = await this.db.query.quantCredential.findMany({
      orderBy: desc(quantCredential.createdAt),
      where: and(
        eq(quantCredential.userId, userId),
        eq(quantCredential.environment, quantEnvironment()),
      ),
    });

    return rows.map(toCredentialDto);
  }

  async createCredential(
    userId: string,
    { apiKey, apiSecret, label }: CreateQuantCredentialDto,
  ): Promise<QuantCredentialDto> {
    try {
      await this.rest.signed<{ balances: PionexBalance[] }>(
        { apiKey, apiSecret },
        'GET',
        '/api/v1/account/balances',
      );
    } catch (error) {
      if (!(error instanceof PionexApiError)) throw error;

      throw new BadRequestException(
        this.t('credentialInvalid', { message: error.message }),
      );
    }

    const [row] = await this.db
      .insert(quantCredential)
      .values({
        apiKeyLast4: apiKey.slice(-4),
        encryptedApiKey: encryptField(apiKey, 'quantCredential'),
        encryptedApiSecret: encryptField(apiSecret, 'quantCredential'),
        environment: quantEnvironment(),
        id: randomUUID(),
        label,
        userId,
      })
      .returning();

    return toCredentialDto(row);
  }

  async removeCredential(userId: string, id: string): Promise<void> {
    const [removed] = await this.db
      .delete(quantCredential)
      .where(
        and(
          eq(quantCredential.id, id),
          eq(quantCredential.userId, userId),
          eq(quantCredential.environment, quantEnvironment()),
        ),
      )
      .returning({ id: quantCredential.id });
    if (!removed) throw new NotFoundException(this.t('credentialNotFound'));

    this.privateStreams.close(id);
  }

  async resolveCredentials(
    userId: string,
    id: string,
  ): Promise<PionexCredentials> {
    const row = await this.db.query.quantCredential.findFirst({
      columns: { encryptedApiKey: true, encryptedApiSecret: true },
      where: and(
        eq(quantCredential.id, id),
        eq(quantCredential.userId, userId),
        eq(quantCredential.environment, quantEnvironment()),
      ),
    });
    if (!row) throw new NotFoundException(this.t('credentialNotFound'));

    return {
      apiKey: decryptField(row.encryptedApiKey, 'quantCredential'),
      apiSecret: decryptField(row.encryptedApiSecret, 'quantCredential'),
    };
  }

  async listBalances(userId: string, id: string): Promise<QuantBalanceDto[]> {
    const { balances } = await this.rest.signed<{ balances: PionexBalance[] }>(
      await this.resolveCredentials(userId, id),
      'GET',
      '/api/v1/account/balances',
    );

    return balances.map(({ coin, free, frozen }) => ({
      coin,
      free: Number(free),
      frozen: Number(frozen),
    }));
  }

  async listOpenOrders(
    userId: string,
    id: string,
    symbol: string,
  ): Promise<QuantOrderDto[]> {
    const { orders } = await this.rest.signed<{ orders: PionexOrder[] }>(
      await this.resolveCredentials(userId, id),
      'GET',
      '/api/v1/trade/openOrders',
      { params: { symbol }, weight: OPEN_ORDERS_WEIGHT },
    );

    return orders.filter(isManualOrder).map(toOrder);
  }

  async listOrders(
    userId: string,
    id: string,
    symbol: string,
  ): Promise<QuantOrderDto[]> {
    const { orders } = await this.rest.signed<{ orders: PionexOrder[] }>(
      await this.resolveCredentials(userId, id),
      'GET',
      '/api/v1/trade/allOrders',
      { params: { limit: ORDER_HISTORY_LIMIT, symbol } },
    );

    return orders.filter(isManualOrder).map(toOrder);
  }

  async listFills(
    userId: string,
    id: string,
    symbol: string,
  ): Promise<QuantFillDto[]> {
    const { fills } = await this.rest.signed<{ fills: PionexFill[] }>(
      await this.resolveCredentials(userId, id),
      'GET',
      '/api/v1/trade/fills',
      { params: { symbol }, weight: FILLS_WEIGHT },
    );
    const botOrderIds = await this.botExchangeOrderIds(
      id,
      fills.map(({ orderId }) => orderId),
    );

    return fills.filter(({ orderId }) => !botOrderIds.has(orderId)).map(toFill);
  }

  async placeOrder(
    userId: string,
    id: string,
    { amount, price, side, size, symbol, type }: PlaceQuantOrderDto,
  ): Promise<PlaceQuantOrderResponseDto> {
    if (type === 'LIMIT' && (!price || !size))
      throw new BadRequestException(this.t('orderFieldsLimit'));
    if (type === 'MARKET' && side === 'BUY' && !amount)
      throw new BadRequestException(this.t('orderFieldsMarketBuy'));
    if (type === 'MARKET' && side === 'SELL' && !size)
      throw new BadRequestException(this.t('orderFieldsMarketSell'));

    await this.symbols.get(symbol);
    const credentials = await this.resolveCredentials(userId, id);

    return this.translateOrderError(() =>
      this.rest.signed<PlaceQuantOrderResponseDto>(
        credentials,
        'POST',
        '/api/v1/trade/order',
        {
          body: {
            clientOrderId: `manual-${randomUUID()}`,
            side,
            symbol,
            type,
            ...(type === 'LIMIT'
              ? { price, size }
              : side === 'BUY'
                ? { amount }
                : { size }),
          },
        },
      ),
    );
  }

  async cancelOrder(
    userId: string,
    id: string,
    symbol: string,
    orderId: string,
  ): Promise<void> {
    if (!/^\d+$/.test(orderId))
      throw new NotFoundException(this.t('orderNotFound'));

    const credentials = await this.resolveCredentials(userId, id);
    const order = await this.rest
      .signed<PionexOrder>(credentials, 'GET', '/api/v1/trade/order', {
        params: { orderId },
      })
      .catch((error: unknown) => {
        if (
          error instanceof PionexApiError &&
          ORDER_NOT_FOUND_CODES.has(error.code)
        )
          throw new NotFoundException(this.t('orderNotFound'));
        throw error;
      });
    if (!isManualOrder(order))
      throw new NotFoundException(this.t('orderNotFound'));

    await this.translateOrderError(() =>
      this.rest.signed(credentials, 'DELETE', '/api/v1/trade/order', {
        // orderId 原樣當 JSON 數字送出；轉成 number 超過 2^53 會被改值
        body: `{"symbol":${JSON.stringify(symbol)},"orderId":${orderId}}`,
      }),
    );
  }

  async cancelAllOrders(
    userId: string,
    id: string,
    symbol: string,
  ): Promise<void> {
    const credentials = await this.resolveCredentials(userId, id);
    const { orders } = await this.rest.signed<{ orders: PionexOrder[] }>(
      credentials,
      'GET',
      '/api/v1/trade/openOrders',
      { params: { symbol }, weight: OPEN_ORDERS_WEIGHT },
    );

    // 交易所的整批撤單不分來源，會連機器人的掛單一起撤掉，所以逐筆撤手動單
    for (const order of orders.filter(isManualOrder))
      await this.translateOrderError(() =>
        this.rest.signed(credentials, 'DELETE', '/api/v1/trade/order', {
          body: `{"symbol":${JSON.stringify(symbol)},"orderId":${order.orderId}}`,
        }),
      );
  }

  private async botExchangeOrderIds(credentialId: string, orderIds: string[]) {
    if (!orderIds.length) return new Set<string>();

    const rows = await this.db
      .select({ exchangeOrderId: quantBotOrder.exchangeOrderId })
      .from(quantBotOrder)
      .innerJoin(quantBot, eq(quantBot.id, quantBotOrder.botId))
      .where(
        and(
          eq(quantBot.credentialId, credentialId),
          inArray(quantBotOrder.exchangeOrderId, orderIds),
        ),
      );

    return new Set(
      rows.flatMap(({ exchangeOrderId }) => exchangeOrderId ?? []),
    );
  }

  orderNotFound() {
    return new NotFoundException(this.t('orderNotFound'));
  }

  async withExchangeError<T>(request: () => Promise<T>) {
    try {
      return await request();
    } catch (error) {
      if (!(error instanceof PionexApiError)) throw error;

      throw new BadRequestException(
        this.t('exchangeError', { message: error.message }),
      );
    }
  }

  async translateOrderError<T>(request: () => Promise<T>) {
    try {
      return await request();
    } catch (error) {
      if (!(error instanceof PionexApiError)) throw error;

      const known =
        KNOWN_ORDER_ERRORS[error.code as keyof typeof KNOWN_ORDER_ERRORS];

      throw new BadRequestException(
        known
          ? this.t(known)
          : this.t('exchangeRejected', { message: error.message }),
      );
    }
  }
}
