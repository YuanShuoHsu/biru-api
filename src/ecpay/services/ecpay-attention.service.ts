import type { EcpayAttentionItemDto } from '../dto/ecpay-attention.dto';

import {
  and,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { ecpayCallbackLog } from 'src/db/schema/ecpay-callback-logs';
import { invoice } from 'src/db/schema/invoices';
import { order } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import { refund } from 'src/db/schema/refunds';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

const SETTLE_GRACE_MS = 30 * 60 * 1000;
const ISSUE_GRACE_MS = 60 * 60 * 1000;
const CALLBACK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const PROBLEM_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const LIMIT_PER_TYPE = 50;

const resolved = alias(ecpayCallbackLog, 'resolved');

@Injectable()
export class EcpayAttentionService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findByOrganization(
    organizationSlug: string,
  ): Promise<EcpayAttentionItemDto[]> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const now = Date.now();
    const settleStale = new Date(now - SETTLE_GRACE_MS);
    const issueStale = new Date(now - ISSUE_GRACE_MS);

    const [refunds, invoices, problems, callbacks] = await Promise.all([
      this.db
        .select({
          confirmationNumber: order.confirmationNumber,
          invoiceError: refund.invoiceError,
          occurredAt: refund.createdAt,
          orderId: order.id,
          orderNumber: order.orderNumber,
        })
        .from(refund)
        .innerJoin(order, eq(order.id, refund.orderId))
        .where(
          and(
            eq(order.sellerId, org.id),
            lt(refund.createdAt, settleStale),
            or(
              and(
                isNotNull(refund.invoiceError),
                isNull(refund.invoiceRetryAt),
              ),
              eq(refund.status, 'pending'),
            ),
          ),
        )
        .orderBy(desc(refund.createdAt))
        .limit(LIMIT_PER_TYPE),

      this.db
        .select({
          confirmationNumber: order.confirmationNumber,
          occurredAt: invoice.createdAt,
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: invoice.status,
        })
        .from(invoice)
        .innerJoin(order, eq(order.id, invoice.orderId))
        .where(
          and(
            eq(order.sellerId, org.id),
            isNotNull(order.paymentDate),
            lt(invoice.createdAt, issueStale),
            or(eq(invoice.status, 'issuing'), eq(invoice.status, 'pending')),
          ),
        )
        .orderBy(desc(invoice.createdAt))
        .limit(LIMIT_PER_TYPE),

      this.db
        .select({
          confirmationNumber: order.confirmationNumber,
          occurredAt: order.updatedAt,
          orderId: order.id,
          orderNumber: order.orderNumber,
        })
        .from(order)
        .where(
          and(
            eq(order.sellerId, org.id),
            eq(order.orderStatus, 'OrderProblem'),
            isNull(order.reconciledAt),
            gte(order.createdAt, new Date(now - PROBLEM_LOOKBACK_MS)),
          ),
        )
        .orderBy(desc(order.updatedAt))
        .limit(LIMIT_PER_TYPE),

      this.db
        .select({
          confirmationNumber: order.confirmationNumber,
          error: ecpayCallbackLog.error,
          macValid: ecpayCallbackLog.macValid,
          occurredAt: ecpayCallbackLog.createdAt,
          orderId: order.id,
          orderNumber: order.orderNumber,
        })
        .from(ecpayCallbackLog)
        .innerJoin(
          order,
          eq(order.confirmationNumber, ecpayCallbackLog.merchantTradeNo),
        )
        .where(
          and(
            eq(order.sellerId, org.id),
            gte(
              ecpayCallbackLog.createdAt,
              new Date(now - CALLBACK_LOOKBACK_MS),
            ),
            // 綠界重送成功會是新的一列，失敗那列自己永遠不會被標記 handled
            notExists(
              this.db
                .select({ one: sql`1` })
                .from(resolved)
                .where(
                  and(
                    eq(
                      resolved.merchantTradeNo,
                      ecpayCallbackLog.merchantTradeNo,
                    ),
                    eq(resolved.handled, true),
                    gt(resolved.createdAt, ecpayCallbackLog.createdAt),
                  ),
                ),
            ),
            or(
              eq(ecpayCallbackLog.macValid, false),
              isNotNull(ecpayCallbackLog.error),
            ),
          ),
        )
        .orderBy(desc(ecpayCallbackLog.createdAt))
        .limit(LIMIT_PER_TYPE),
    ]);

    return [
      ...refunds.map(({ invoiceError, ...rest }) => ({
        ...rest,
        detail: invoiceError,
        type: invoiceError
          ? ('invoiceSettlementFailed' as const)
          : ('refundUnconfirmed' as const),
      })),
      ...invoices.map(({ status, ...rest }) => ({
        ...rest,
        detail: null,
        type:
          status === 'issuing'
            ? ('invoiceStuck' as const)
            : ('invoiceOverdue' as const),
      })),
      ...problems.map((row) => ({
        ...row,
        detail: null,
        type: 'paymentProblem' as const,
      })),
      ...callbacks.map(({ error, macValid, ...rest }) => ({
        ...rest,
        detail: macValid ? error : '驗簽失敗',
        type: 'callbackFailed' as const,
      })),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  }
}
