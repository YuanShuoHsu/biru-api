import { randomUUID } from 'crypto';

import { and, desc, eq } from 'drizzle-orm';
import type { EcpayCallbackEndpoint } from 'src/db/schema/ecpay-callback-logs';
import { ecpayCallbackLog } from 'src/db/schema/ecpay-callback-logs';
import { order } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { OrderPaymentNotificationDto } from '../dto/order-payment-notification.dto';

const MASKED_FIELDS = ['card4no', 'card6no', 'auth_code'];

const UNTRUSTED_FIELDS = ['MerchantTradeNo', 'RtnCode', 'TradeNo'];
const UNTRUSTED_VALUE_MAX_LENGTH = 64;

export interface CallbackLogEntry {
  endpoint: EcpayCallbackEndpoint;
  error?: string;
  macValid: boolean;
  merchantTradeNo?: string;
  rawBody: Record<string, string>;
}

const isTrusted = ({ endpoint, macValid }: CallbackLogEntry): boolean =>
  endpoint === 'query' || macValid;

const sanitize = (entry: CallbackLogEntry): Record<string, string> => {
  const { rawBody } = entry;

  if (!isTrusted(entry))
    return Object.fromEntries(
      UNTRUSTED_FIELDS.filter((key) => rawBody[key] !== undefined).map(
        (key) => [
          key,
          String(rawBody[key]).slice(0, UNTRUSTED_VALUE_MAX_LENGTH),
        ],
      ),
    );

  return Object.fromEntries(
    Object.entries(rawBody).map(([key, value]) => [
      key,
      MASKED_FIELDS.includes(key) ? '*'.repeat(String(value).length) : value,
    ]),
  );
};

@Injectable()
export class EcpayCallbackLogService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async record(entry: CallbackLogEntry): Promise<string> {
    const [{ id }] = await this.db
      .insert(ecpayCallbackLog)
      .values({
        id: randomUUID(),
        endpoint: entry.endpoint,
        error: entry.error,
        macValid: entry.macValid,
        merchantTradeNo: entry.merchantTradeNo,
        rawBody: sanitize(entry),
      })
      .returning({ id: ecpayCallbackLog.id });

    return id;
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.db
      .update(ecpayCallbackLog)
      .set({ error })
      .where(eq(ecpayCallbackLog.id, id));
  }

  async markHandled(id: string): Promise<void> {
    await this.db
      .update(ecpayCallbackLog)
      .set({ handled: true })
      .where(eq(ecpayCallbackLog.id, id));
  }

  async findByOrder(
    organizationSlug: string,
    orderId: string,
  ): Promise<OrderPaymentNotificationDto[]> {
    const [found] = await this.db
      .select({ confirmationNumber: order.confirmationNumber })
      .from(order)
      .innerJoin(organization, eq(order.sellerId, organization.id))
      .where(
        and(eq(order.id, orderId), eq(organization.slug, organizationSlug)),
      );

    if (!found) throw new NotFoundException('Order not found');
    if (!found.confirmationNumber) return [];

    return (
      this.db
        .select({
          id: ecpayCallbackLog.id,
          createdAt: ecpayCallbackLog.createdAt,
          endpoint: ecpayCallbackLog.endpoint,
          error: ecpayCallbackLog.error,
          handled: ecpayCallbackLog.handled,
          macValid: ecpayCallbackLog.macValid,
        })
        .from(ecpayCallbackLog)
        // 驗簽失敗的通知不能濾掉：「通知有進來但驗簽沒過」正是金鑰設錯時唯一的線索，
        // 而 merchantTradeNo 是每張訂單獨有的隨機碼，亂打的請求對不上任何訂單
        .where(eq(ecpayCallbackLog.merchantTradeNo, found.confirmationNumber))
        .orderBy(desc(ecpayCallbackLog.createdAt))
    );
  }
}
