import { randomUUID } from 'crypto';

import { and, asc, desc, eq, lt, lte, ne, or } from 'drizzle-orm';

import type { AllowanceInvoiceEcpayItemDto } from '../dto/allowance-invoice-ecpay.dto';
import type {
  CreateOrderRefundDto,
  OrderRefundDto,
  OrderRefundPreviewDto,
} from '../dto/order-refund.dto';

import {
  EcpayRejectedError,
  ITEM_WORD,
  QUERY_INTERVAL_MS,
  sleep,
  toGetIssueQuery,
  toInvoiceDateText,
} from '../utils/ecpay';
import type { RefundPlanTranslate } from '../utils/refund-plan';
import {
  buildRefundPlan,
  earliestVoidableInvoiceDate,
} from '../utils/refund-plan';

import { EcpayAllowanceInvoiceService } from './ecpay-allowance-invoice.service';
import {
  EcpayDoActionService,
  EcpayResultUnknownError,
} from './ecpay-do-action.service';
import { EcpayGetIssueInvoiceService } from './ecpay-get-issue-invoice.service';
import { EcpayInvalidInvoiceService } from './ecpay-invalid-invoice.service';
import { EcpayQueryCreditDetailService } from './ecpay-query-credit-detail.service';
import { EcpayRateLimitedError } from './ecpay-query-trade-info.service';

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';

import { I18nContext, I18nService } from 'nestjs-i18n';
import type { Invoice } from 'src/db/schema/invoices';
import { invoice, invoiceAllowance } from 'src/db/schema/invoices';
import type { OrderCustomerSnapshot } from 'src/db/schema/orders';
import { order } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import type {
  Refund,
  RefundInvoiceAction,
  RefundItemSnapshot,
} from 'src/db/schema/refunds';
import { refund } from 'src/db/schema/refunds';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import type { I18nTranslations } from 'src/generated/i18n.generated';

import { STORE_UTC_OFFSET } from 'src/common/constants/timezone';
import { toActiveInvoice } from 'src/common/utils/invoices';
import { CouponsService } from 'src/coupons/coupons.service';
import { ORDER_STATUS_UPDATED_EVENT } from 'src/events/order-status-updated.event';
import { InventoryTransactionsService } from 'src/inventory/inventory-transactions.service';
import { getRefundChannel, isRefundable } from 'src/orders/order-transitions';
import { PointsService } from 'src/points/points.service';

const SETTLE_GRACE_MS = 10 * 60 * 1000;
const SETTLE_LEASE_MS = 15 * 60 * 1000;
const AMBIGUOUS_GRACE_MS = 30 * 60 * 1000;

const QUERY_LIMIT_PER_RUN = 20;
const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;

const CLOSED_TRADE_STATUSES = ['已關帳', '已取消'];

const DEFAULT_INVOICE_REASON = '訂單退款';
const INVALID_REASON_MAX_LENGTH = 20;
const INVOICE_RETRY_BATCH_SIZE = 20;
const SETTLE_BATCH_SIZE = 20;

const INVOICE_RETRY_BASE_MS = 10 * 60 * 1000;
const INVOICE_RETRY_MAX_MS = 24 * 60 * 60 * 1000;
const INVOICE_RETRY_MAX_ATTEMPTS = 8;

const nextInvoiceRetryAt = (attempts: number): Date | null =>
  attempts >= INVOICE_RETRY_MAX_ATTEMPTS
    ? null
    : new Date(
        Date.now() +
          Math.min(
            INVOICE_RETRY_BASE_MS * 2 ** (attempts - 1),
            INVOICE_RETRY_MAX_MS,
          ),
      );

interface InvoiceSettlement {
  action: RefundInvoiceAction;
  allowanceNo: string | null;
  error: string | null;
  retryable?: boolean;
}

interface AllowanceState {
  issued: boolean;
  remaining: number;
}

interface ReconciledInvoice {
  allowance: AllowanceState | undefined;
  data: Invoice | null;
  settled: InvoiceSettlement | null;
}

interface SettlementOrder {
  customer: OrderCustomerSnapshot;
  discountCode: string | null;
  invoice: Invoice | null;
  sellerId: string;
}

interface RefundSettlement {
  allocatedDiscount: number;
  amount: number;
  isFull: boolean;
  items: RefundItemSnapshot[];
  ratio: number;
}

@Injectable()
export class EcpayOrderRefundService {
  private readonly logger = new Logger(EcpayOrderRefundService.name);

  private repairing = false;
  private rateLimitedUntil = 0;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ecpayDoActionService: EcpayDoActionService,
    private readonly ecpayInvalidInvoiceService: EcpayInvalidInvoiceService,
    private readonly ecpayAllowanceInvoiceService: EcpayAllowanceInvoiceService,
    private readonly ecpayQueryCreditDetailService: EcpayQueryCreditDetailService,
    private readonly ecpayGetIssueInvoiceService: EcpayGetIssueInvoiceService,
    private readonly couponsService: CouponsService,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly pointsService: PointsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  private readonly t: RefundPlanTranslate = (key, args) =>
    this.i18n.t(`common.refunds.${key}`, {
      args,
      lang: I18nContext.current()?.lang,
    });

  private tRefunds(
    key:
      | 'alreadyRefunded'
      | 'noEcpayTransaction'
      | 'notPaid'
      | 'notRefundable'
      | 'resultUnknown',
  ): string {
    return this.i18n.t(`common.refunds.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  async previewRefund(
    organizationSlug: string,
    orderId: string,
    dto: CreateOrderRefundDto,
  ): Promise<OrderRefundPreviewDto> {
    const found = await this.findRefundableOrder(organizationSlug, orderId);

    const previous = await this.db
      .select({ items: refund.items })
      .from(refund)
      .where(eq(refund.orderId, orderId));

    const { allocatedDiscount, amount, isFull } = buildRefundPlan(
      found,
      previous,
      dto.items,
      this.t,
    );

    return { allocatedDiscount, amount, isFull };
  }

  private async findRefundableOrder(organizationSlug: string, orderId: string) {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const found = await this.db.query.order.findFirst({
      where: and(eq(order.id, orderId), eq(order.sellerId, org.id)),
      with: { invoices: true, items: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    return toActiveInvoice(found);
  }

  async refundOrder(
    organizationSlug: string,
    orderId: string,
    dto: CreateOrderRefundDto,
    operatorId?: string,
  ): Promise<OrderRefundDto> {
    const found = await this.findRefundableOrder(organizationSlug, orderId);

    const { created, plan } = await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({
          orderStatus: order.orderStatus,
          paymentDate: order.paymentDate,
        })
        .from(order)
        .where(eq(order.id, orderId))
        .for('update');

      if (!locked) throw new NotFoundException('Order not found');
      if (!locked.paymentDate)
        throw new ConflictException(this.tRefunds('notPaid'));
      if (locked.orderStatus === 'OrderReturned')
        throw new ConflictException(this.tRefunds('alreadyRefunded'));
      if (!isRefundable(locked))
        throw new ConflictException(this.tRefunds('notRefundable'));

      const previous = await tx
        .select({ items: refund.items })
        .from(refund)
        .where(eq(refund.orderId, orderId));

      const plan = buildRefundPlan(found, previous, dto.items, this.t);

      const [created] = await tx
        .insert(refund)
        .values({
          id: randomUUID(),
          amount: String(plan.amount),
          channel:
            plan.amount > 0 ? getRefundChannel(found.paymentMethod) : 'manual',
          items: plan.items,
          operatorId,
          orderId,
          reason: dto.reason,
          scope: plan.isFull ? 'full' : 'partial',
        })
        .returning();

      return { created, plan };
    });

    let refunded = created;

    if (created.channel === 'ecpay') {
      if (!found.confirmationNumber || !found.tradeNo) {
        await this.db.delete(refund).where(eq(refund.id, created.id));

        throw new ConflictException(this.tRefunds('noEcpayTransaction'));
      }

      try {
        const result = await this.ecpayDoActionService.refund({
          amount: plan.amount,
          merchantTradeNo: found.confirmationNumber,
          tradeNo: found.tradeNo,
        });

        [refunded] = await this.db
          .update(refund)
          .set({
            ecpayRtnCode: result.RtnCode,
            ecpayRtnMsg: result.RtnMsg,
            status: 'refunded',
          })
          .where(eq(refund.id, created.id))
          .returning();
      } catch (error) {
        if (error instanceof EcpayResultUnknownError) {
          this.logger.error(
            `退款 ${created.id} 送出後未取得綠界回覆，保留待對帳`,
            error,
          );

          throw new ServiceUnavailableException(this.tRefunds('resultUnknown'));
        }

        await this.db.delete(refund).where(eq(refund.id, created.id));

        throw this.toRefundFailure(error);
      }
    } else {
      [refunded] = await this.db
        .update(refund)
        .set({ status: 'refunded' })
        .where(eq(refund.id, created.id))
        .returning();
    }

    await this.settle(refunded, found, plan).catch((error) =>
      this.logger.error(`退款 ${refunded.id} 的後續處理失敗，待補正`, error),
    );

    const [final] = await this.db
      .select()
      .from(refund)
      .where(eq(refund.id, created.id));

    return final;
  }

  private async settle(
    created: Refund,
    found: SettlementOrder,
    plan: RefundSettlement,
  ): Promise<void> {
    const claimed = await this.claim(created);
    if (!claimed) return;

    if (claimed.invoiceAction === null) {
      const invoiceResult = await this.settleInvoiceReconciled(found, plan, {
        reason: claimed.reason ?? undefined,
        reconcile: created.status === 'settling',
        refundId: claimed.id,
      });

      await this.db
        .update(refund)
        .set(this.toInvoiceFields(invoiceResult, claimed.invoiceAttempts + 1))
        .where(eq(refund.id, claimed.id));
    }

    await this.db.transaction(async (tx) => {
      await this.pointsService.revokeForOrder(tx, {
        orderBecomesTerminal: plan.isFull,
        orderId: claimed.orderId,
        ratio: plan.ratio,
      });

      if (plan.isFull && found.discountCode)
        await this.couponsService.restore(tx, {
          code: found.discountCode,
          orderId: claimed.orderId,
        });

      if (plan.isFull) {
        await this.inventoryTransactionsService.restoreAll(claimed.orderId, tx);

        await tx
          .update(order)
          .set({ orderStatus: 'OrderReturned' })
          .where(eq(order.id, claimed.orderId));
      }

      await tx
        .update(refund)
        .set({ status: 'settled' })
        .where(eq(refund.id, claimed.id));
    });

    if (plan.isFull)
      this.eventEmitter.emit(ORDER_STATUS_UPDATED_EVENT, {
        orderId: claimed.orderId,
        orderStatus: 'OrderReturned',
        organizationId: found.sellerId,
      });
  }

  /**
   * 只有把 refunded 推進到 settling 的那個呼叫者能往下走，
   * 其餘（補正 cron 與進行中的 settle 重疊時）直接放棄，
   * 否則同一筆退款會對綠界開出兩張折讓、對顧客扣兩次點數。
   */
  private async claim(created: Refund): Promise<Refund | undefined> {
    const [claimed] = await this.db
      .update(refund)
      .set({ status: 'settling' })
      .where(
        and(
          eq(refund.id, created.id),
          or(
            eq(refund.status, 'refunded'),
            and(
              eq(refund.status, 'settling'),
              lt(refund.updatedAt, new Date(Date.now() - SETTLE_LEASE_MS)),
            ),
          ),
        ),
      )
      .returning();

    return claimed;
  }

  private toSettlement(
    created: Refund,
    found: { total: string },
  ): RefundSettlement {
    const items = created.items ?? [];
    const amount = Number(created.amount);
    const salesAmount = Math.round(Number(found.total));

    return {
      allocatedDiscount:
        items.reduce((sum, item) => sum + Number(item.amount), 0) - amount,
      amount,
      isFull: created.scope === 'full',
      items,
      ratio: salesAmount ? Math.min(amount / salesAmount, 1) : 0,
    };
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async repairInterruptedRefunds(): Promise<void> {
    if (this.repairing) return;

    this.repairing = true;
    try {
      await this.repair();
      await this.retryFailedInvoiceSettlements();
    } catch (error) {
      this.logger.error('退款補正失敗', error);
    } finally {
      this.repairing = false;
    }
  }

  private async retryFailedInvoiceSettlements(): Promise<void> {
    const now = new Date();

    const failed = await this.db
      .select()
      .from(refund)
      .where(
        and(
          eq(refund.invoiceAction, 'failed'),
          lte(refund.invoiceRetryAt, now),
        ),
      )
      .orderBy(asc(refund.invoiceRetryAt))
      .limit(INVOICE_RETRY_BATCH_SIZE);

    for (const [index, created] of failed.entries()) {
      const attempts = created.invoiceAttempts + 1;

      const [claimed] = await this.db
        .update(refund)
        .set({
          invoiceAttempts: attempts,
          invoiceRetryAt: nextInvoiceRetryAt(attempts),
        })
        .where(
          and(
            eq(refund.id, created.id),
            eq(refund.invoiceAction, 'failed'),
            lte(refund.invoiceRetryAt, now),
          ),
        )
        .returning();
      if (!claimed) continue;

      if (index > 0) await sleep(QUERY_INTERVAL_MS);

      try {
        const action = await this.settleInvoiceForRefund(claimed);

        if (action && action !== 'failed')
          this.logger.warn(
            `退款 ${claimed.id} 的發票處理先前失敗，已補正為 ${action}`,
          );
      } catch (error) {
        this.logger.error(`退款 ${claimed.id} 的發票補正失敗`, error);
      }
    }
  }

  private async reconcileInvoice(
    data: Invoice | null,
    latest: { remainingAmount: string } | undefined,
    amount: number,
  ): Promise<ReconciledInvoice> {
    const query = data?.status === 'issued' ? toGetIssueQuery(data) : null;
    if (!data || !query) return { allowance: undefined, data, settled: null };

    const result = await this.ecpayGetIssueInvoiceService.getIssue(query);

    if (result.IIS_Invalid_Status === '1') {
      const [voided] = await this.db
        .update(invoice)
        .set({ status: 'voided', voidedAt: new Date() })
        .where(eq(invoice.id, data.id))
        .returning();

      this.logger.warn(
        `發票 ${data.invoiceNumber} 已於綠界作廢但本機未記錄，重試時已對齊`,
      );

      return {
        allowance: undefined,
        data: voided,
        settled: { action: 'voided', allowanceNo: null, error: null },
      };
    }

    const salesAmount = Number(result.IIS_Sales_Amount);
    const remaining = Number(result.IIS_Remain_Allowance_Amt);

    if (!Number.isFinite(salesAmount) || !Number.isFinite(remaining)) {
      this.logger.warn(
        `發票 ${data.invoiceNumber} 查不到綠界折讓額度，改以本機紀錄判斷`,
      );

      return { allowance: undefined, data, settled: null };
    }

    const missing =
      (latest ? Number(latest.remainingAmount) : salesAmount) - remaining;

    if (missing > 0 && missing === amount) {
      this.logger.error(
        `折讓已於綠界開立但本機未記錄（發票 ${data.invoiceNumber}，${amount} 元），需人工補折讓單號`,
      );

      return {
        allowance: undefined,
        data,
        settled: {
          action: 'allowance',
          allowanceNo: null,
          error: `折讓已開立但本機未寫入，需人工補紀錄（發票 ${data.invoiceNumber}）`,
        },
      };
    }

    if (missing > 0) {
      this.logger.error(
        `發票 ${data.invoiceNumber} 在綠界少了 ${missing} 元折讓額度但本機無對應紀錄，需人工核對`,
      );

      return {
        allowance: undefined,
        data,
        settled: {
          action: 'failed',
          allowanceNo: null,
          error: `綠界折讓額度短少 ${missing} 元但本機無對應紀錄，需人工核對（發票 ${data.invoiceNumber}）`,
          retryable: false,
        },
      };
    }

    return {
      allowance: { issued: remaining < salesAmount, remaining },
      data,
      settled: null,
    };
  }

  private async settleInvoiceForRefund(
    claimed: Refund,
  ): Promise<RefundInvoiceAction | null> {
    const row = await this.db.query.order.findFirst({
      where: eq(order.id, claimed.orderId),
      with: { invoices: true },
    });
    if (!row) return null;

    const found = toActiveInvoice(row);

    const result = await this.settleInvoiceReconciled(
      found,
      this.toSettlement(claimed, found),
      {
        reason: claimed.reason ?? undefined,
        reconcile: true,
        refundId: claimed.id,
      },
    );

    await this.db
      .update(refund)
      .set(this.toInvoiceFields(result, claimed.invoiceAttempts))
      .where(eq(refund.id, claimed.id));

    return result.action;
  }

  private async settleInvoiceReconciled(
    found: SettlementOrder,
    plan: RefundSettlement,
    {
      reason,
      reconcile,
      refundId,
    }: { reason?: string; reconcile: boolean; refundId: string },
  ): Promise<InvoiceSettlement> {
    const issued = await this.allowanceForRefund(refundId);
    if (issued)
      return {
        action: 'allowance',
        allowanceNo: issued.allowanceNo,
        error: null,
      };

    const latest = found.invoice
      ? await this.latestAllowance(found.invoice.id)
      : undefined;

    let reconciled: ReconciledInvoice;

    try {
      reconciled = reconcile
        ? await this.reconcileInvoice(found.invoice, latest, plan.amount)
        : { allowance: undefined, data: found.invoice, settled: null };
    } catch (error) {
      return {
        action: 'failed',
        allowanceNo: null,
        error: `發票現況查證失敗：${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
      };
    }

    if (reconciled.settled) return reconciled.settled;

    try {
      return await this.settleInvoice(reconciled.data, plan, {
        allowance: reconciled.allowance,
        latest,
        notifyEmail:
          reconciled.data?.email || found.customer.email || undefined,
        reason,
        refundId,
      });
    } catch (error) {
      return {
        action: 'failed',
        allowanceNo: null,
        error: error instanceof Error ? error.message : String(error),
        retryable: !(error instanceof EcpayRejectedError),
      };
    }
  }

  private toInvoiceFields(
    result: InvoiceSettlement,
    attempts: number,
  ): {
    allowanceNo: string | null;
    invoiceAction: RefundInvoiceAction;
    invoiceAttempts: number;
    invoiceError: string | null;
    invoiceRetryAt: Date | null;
  } {
    return {
      allowanceNo: result.allowanceNo,
      invoiceAction: result.action,
      invoiceAttempts: attempts,
      invoiceError: result.error,
      invoiceRetryAt:
        result.action === 'failed' && result.retryable
          ? nextInvoiceRetryAt(attempts)
          : null,
    };
  }

  private async repair(): Promise<void> {
    const interrupted = await this.db
      .select()
      .from(refund)
      .where(
        or(
          and(
            eq(refund.status, 'refunded'),
            lt(refund.updatedAt, new Date(Date.now() - SETTLE_GRACE_MS)),
          ),
          and(
            eq(refund.status, 'settling'),
            lt(refund.updatedAt, new Date(Date.now() - SETTLE_LEASE_MS)),
          ),
        ),
      )
      .orderBy(asc(refund.updatedAt))
      .limit(SETTLE_BATCH_SIZE);

    for (const [index, created] of interrupted.entries()) {
      const row = await this.db.query.order.findFirst({
        where: eq(order.id, created.orderId),
        with: { invoices: true },
      });
      if (!row) continue;

      const found = toActiveInvoice(row);

      if (index > 0) await sleep(QUERY_INTERVAL_MS);

      try {
        await this.settle(created, found, this.toSettlement(created, found));

        this.logger.warn(`退款 ${created.id} 的後續處理先前中斷，已補正`);
      } catch (error) {
        this.logger.error(`退款 ${created.id} 補正失敗`, error);
      }
    }

    const ambiguous = await this.db
      .select({ id: refund.id, amount: refund.amount, orderId: refund.orderId })
      .from(refund)
      .where(
        and(
          eq(refund.status, 'pending'),
          eq(refund.channel, 'ecpay'),
          lt(refund.createdAt, new Date(Date.now() - AMBIGUOUS_GRACE_MS)),
        ),
      )
      .orderBy(asc(refund.createdAt))
      .limit(QUERY_LIMIT_PER_RUN);
    if (!ambiguous.length) return;

    const unresolved = await this.reconcilePending(ambiguous);

    if (unresolved.length)
      this.logger.error(
        `有 ${unresolved.length} 筆退款停在未確認狀態，請至綠界後台核對是否已退款：${unresolved
          .map(({ id, orderId }) => `${id}（訂單 ${orderId}）`)
          .join('、')}`,
      );
  }

  private async reconcilePending(
    pending: { amount: string; id: string; orderId: string }[],
  ): Promise<{ id: string; orderId: string }[]> {
    if (!this.ecpayQueryCreditDetailService.isAvailable) return pending;
    if (Date.now() < this.rateLimitedUntil) return pending;

    const unresolved: { id: string; orderId: string }[] = [];

    for (const [index, row] of pending.entries()) {
      if (index > 0) await sleep(QUERY_INTERVAL_MS);

      try {
        const resolved = await this.resolvePending(row);
        if (!resolved) unresolved.push(row);
      } catch (error) {
        if (error instanceof EcpayRateLimitedError) {
          this.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          this.logger.error(
            `綠界信用卡明細查詢已限速，暫停退款對帳 ${RATE_LIMIT_COOLDOWN_MS / 60000} 分鐘`,
          );

          unresolved.push(row);
          break;
        }

        this.logger.warn(
          `退款 ${row.id} 對帳失敗：${error instanceof Error ? error.message : String(error)}`,
        );

        unresolved.push(row);
      }
    }

    return unresolved;
  }

  private async resolvePending(row: {
    amount: string;
    id: string;
    orderId: string;
  }): Promise<boolean> {
    const data = await this.db.query.order.findFirst({
      where: eq(order.id, row.orderId),
      with: { invoices: true },
    });
    if (!data) return false;

    const found = toActiveInvoice(data);
    if (!found.authorizationNo) return false;

    const result = await this.ecpayQueryCreditDetailService.queryCreditDetail({
      amount: Math.round(Number(found.total)),
      authorizationNo: found.authorizationNo,
    });

    const value = result.RtnValue;
    if (!value || !CLOSED_TRADE_STATUSES.includes(value.status)) return false;

    const refundedAtEcpay = Number(value.amount) - Number(value.clsamt);
    if (!Number.isFinite(refundedAtEcpay)) return false;

    const confirmed = await this.sumConfirmedRefunds(row.orderId);
    const amount = Number(row.amount);

    if (refundedAtEcpay >= confirmed + amount) {
      await this.db
        .update(refund)
        .set({ status: 'refunded' })
        .where(and(eq(refund.id, row.id), eq(refund.status, 'pending')));

      this.logger.warn(`退款 ${row.id} 經對帳確認已退刷，接續後續處理`);

      const [reclaimed] = await this.db
        .select()
        .from(refund)
        .where(eq(refund.id, row.id));

      await this.settle(reclaimed, found, this.toSettlement(reclaimed, found));

      return true;
    }

    if (refundedAtEcpay <= confirmed) {
      await this.db
        .delete(refund)
        .where(and(eq(refund.id, row.id), eq(refund.status, 'pending')));

      this.logger.warn(`退款 ${row.id} 經對帳確認未退刷，已移除該筆紀錄`);

      return true;
    }

    return false;
  }

  private async sumConfirmedRefunds(orderId: string): Promise<number> {
    const rows = await this.db
      .select({ amount: refund.amount })
      .from(refund)
      .where(
        and(
          eq(refund.orderId, orderId),
          eq(refund.channel, 'ecpay'),
          ne(refund.status, 'pending'),
        ),
      );

    return rows.reduce((sum, { amount }) => sum + Number(amount), 0);
  }

  async findByOrder(
    organizationSlug: string,
    orderId: string,
  ): Promise<OrderRefundDto[]> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const found = await this.db
      .select({ id: order.id })
      .from(order)
      .where(and(eq(order.id, orderId), eq(order.sellerId, org.id)));
    if (!found.length) throw new NotFoundException('Order not found');

    return this.db
      .select({
        id: refund.id,
        allowanceNo: refund.allowanceNo,
        amount: refund.amount,
        channel: refund.channel,
        createdAt: refund.createdAt,
        invoiceAction: refund.invoiceAction,
        invoiceError: refund.invoiceError,
        items: refund.items,
        reason: refund.reason,
        scope: refund.scope,
        status: refund.status,
      })
      .from(refund)
      .where(eq(refund.orderId, orderId))
      .orderBy(desc(refund.createdAt));
  }

  private toRefundFailure(error: unknown): unknown {
    if (error instanceof ServiceUnavailableException) return error;
    if (error instanceof Error) return new ConflictException(error.message);

    return error;
  }

  private async settleInvoice(
    data: Invoice | null,
    plan: {
      allocatedDiscount: number;
      amount: number;
      items: RefundItemSnapshot[];
      isFull: boolean;
    },
    {
      allowance,
      latest,
      notifyEmail,
      reason,
      refundId,
    }: {
      allowance?: AllowanceState;
      latest: { remainingAmount: string } | undefined;
      notifyEmail?: string;
      reason?: string;
      refundId: string;
    },
  ): Promise<InvoiceSettlement> {
    if (!data) return { action: 'none', allowanceNo: null, error: null };

    if (data.status === 'pending' || data.status === 'issuing')
      return {
        action: 'failed',
        allowanceNo: null,
        error: `退款時發票尚未開立（${data.status}），待開立後補處理`,
        retryable: true,
      };

    if (data.status !== 'issued' || !data.invoiceNumber || !data.invoiceDate)
      return { action: 'none', allowanceNo: null, error: null };

    const invoiceDateText = toInvoiceDateText(data.invoiceDate);

    const voidable =
      plan.isFull &&
      !latest &&
      !allowance?.issued &&
      data.invoiceDate >= earliestVoidableInvoiceDate(new Date());

    try {
      if (voidable) {
        try {
          await this.ecpayInvalidInvoiceService.invalidInvoice({
            InvoiceDate: invoiceDateText,
            InvoiceNo: data.invoiceNumber,
            Reason: (reason || DEFAULT_INVOICE_REASON).slice(
              0,
              INVALID_REASON_MAX_LENGTH,
            ),
          });

          try {
            await this.db
              .update(invoice)
              .set({ status: 'voided', voidedAt: new Date() })
              .where(eq(invoice.id, data.id));
          } catch (writeError) {
            this.logger.error(
              `發票 ${data.invoiceNumber} 已於綠界作廢但寫入失敗，需人工補狀態：${writeError instanceof Error ? writeError.message : String(writeError)}`,
            );

            return {
              action: 'voided',
              allowanceNo: null,
              error: `發票已作廢但本機未寫入，需人工補狀態（${data.invoiceNumber}）`,
            };
          }

          return { action: 'voided', allowanceNo: null, error: null };
        } catch (error) {
          if (!(error instanceof EcpayRejectedError)) throw error;

          this.logger.warn(
            `發票 ${data.invoiceNumber} 作廢失敗，改開折讓：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (plan.amount <= 0)
        return { action: 'none', allowanceNo: null, error: null };

      this.assertAllowanceHeadroom(allowance, latest, plan.amount);

      const result = await this.ecpayAllowanceInvoiceService.allowanceInvoice({
        AllowanceAmount: plan.amount,
        AllowanceNotify: notifyEmail ? 'E' : 'N',
        InvoiceDate: invoiceDateText,
        InvoiceNo: data.invoiceNumber,
        Items: this.buildAllowanceItems(plan),
        NotifyMail: notifyEmail,
        Reason: reason || DEFAULT_INVOICE_REASON,
      });

      try {
        await this.db.insert(invoiceAllowance).values({
          id: randomUUID(),
          allowanceNo: result.IA_Allow_No,
          amount: String(plan.amount),
          invoiceId: data.id,
          refundId,
          issuedAt: new Date(
            `${result.IA_Date.replace(' ', 'T')}${STORE_UTC_OFFSET}`,
          ),
          remainingAmount: String(result.IA_Remain_Allowance_Amt),
        });
      } catch (writeError) {
        this.logger.error(
          `折讓 ${result.IA_Allow_No} 已開立但寫入失敗，需人工補紀錄：${writeError instanceof Error ? writeError.message : String(writeError)}`,
        );

        return {
          action: 'allowance',
          allowanceNo: result.IA_Allow_No,
          error: `折讓已開立但本機未寫入，需人工補紀錄（${result.IA_Allow_No}）`,
        };
      }

      return {
        action: 'allowance',
        allowanceNo: result.IA_Allow_No,
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `退款已完成但發票處理失敗（發票 ${data.invoiceNumber}）：${message}`,
      );

      return {
        action: 'failed',
        allowanceNo: null,
        error: message,
        retryable: !(error instanceof EcpayRejectedError),
      };
    }
  }

  private async allowanceForRefund(
    refundId: string,
  ): Promise<{ allowanceNo: string } | undefined> {
    const [issued] = await this.db
      .select({ allowanceNo: invoiceAllowance.allowanceNo })
      .from(invoiceAllowance)
      .where(eq(invoiceAllowance.refundId, refundId))
      .limit(1);

    return issued;
  }

  private async latestAllowance(
    invoiceId: string,
  ): Promise<{ remainingAmount: string } | undefined> {
    const [latest] = await this.db
      .select({ remainingAmount: invoiceAllowance.remainingAmount })
      .from(invoiceAllowance)
      .where(eq(invoiceAllowance.invoiceId, invoiceId))
      .orderBy(desc(invoiceAllowance.createdAt))
      .limit(1);

    return latest;
  }

  private assertAllowanceHeadroom(
    allowance: AllowanceState | undefined,
    latest: { remainingAmount: string } | undefined,
    amount: number,
  ): void {
    const remaining = allowance
      ? allowance.remaining
      : latest && Number(latest.remainingAmount);

    if (remaining === undefined) return;
    if (!Number.isFinite(remaining) || amount <= remaining) return;

    const message = this.i18n.t('common.refunds.allowanceExceeded', {
      args: { amount, remaining },
      lang: I18nContext.current()?.lang,
    });

    // 本機額度可能落後綠界，只有綠界給的數字才算定論，其餘留給下一輪 reconcile 重判
    throw allowance ? new EcpayRejectedError(message) : new Error(message);
  }

  private buildAllowanceItems(plan: {
    allocatedDiscount: number;
    items: RefundItemSnapshot[];
  }): AllowanceInvoiceEcpayItemDto[] {
    const items: AllowanceInvoiceEcpayItemDto[] = plan.items.map(
      (item, index) => ({
        ItemAmount: Number(item.amount),
        ItemCount: item.quantity,
        ItemName: item.menuItemName,
        ItemPrice: Number(item.unitPrice),
        ItemSeq: index + 1,
        ItemWord: ITEM_WORD,
      }),
    );

    if (plan.allocatedDiscount > 0)
      items.push({
        ItemAmount: -plan.allocatedDiscount,
        ItemCount: 1,
        ItemName: '折扣',
        ItemPrice: -plan.allocatedDiscount,
        ItemSeq: items.length + 1,
        ItemWord: ITEM_WORD,
      });

    return items;
  }
}
