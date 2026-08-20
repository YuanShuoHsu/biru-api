import { randomUUID } from 'crypto';

import { and, desc, eq, lt, ne, or } from 'drizzle-orm';

import type { AllowanceInvoiceEcpayItemDto } from '../dto/allowance-invoice-ecpay.dto';
import type {
  CreateOrderRefundDto,
  OrderRefundDto,
  OrderRefundPreviewDto,
} from '../dto/order-refund.dto';

import { ITEM_WORD, toInvoiceDateText } from '../utils/ecpay';
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
import type {
  OrderCustomerSnapshot,
  PaymentMethod,
} from 'src/db/schema/orders';
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
import { CouponsService } from 'src/coupons/coupons.service';
import { ORDER_STATUS_UPDATED_EVENT } from 'src/events/order-status-updated.event';
import { isRefundable } from 'src/orders/order-transitions';
import { PointsService } from 'src/points/points.service';

const ECPAY_REFUNDABLE_METHODS: PaymentMethod[] = ['ApplePay', 'Credit'];

const SETTLE_GRACE_MS = 10 * 60 * 1000;
// 認領後多久視為該行程已死、可被接手；綠界折讓實測是秒級，抓寬一點
const SETTLE_LEASE_MS = 15 * 60 * 1000;
const AMBIGUOUS_GRACE_MS = 30 * 60 * 1000;

// 綠界對這支查詢限速，被擋就是整整 30 分鐘，所以查得比對帳需要的還慢
const QUERY_INTERVAL_MS = 300;
const QUERY_LIMIT_PER_RUN = 20;
const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;

// 只有這兩種狀態下 amount - clsamt 才等於已退金額
const CLOSED_TRADE_STATUSES = ['已關帳', '已取消'];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_INVOICE_REASON = '訂單退款';
const INVALID_REASON_MAX_LENGTH = 20;

interface InvoiceSettlement {
  action: RefundInvoiceAction;
  allowanceNo: string | null;
  error: string | null;
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
    private readonly couponsService: CouponsService,
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
      with: { invoice: true, items: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    return found;
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
            plan.amount > 0 &&
            ECPAY_REFUNDABLE_METHODS.includes(found.paymentMethod)
              ? 'ecpay'
              : 'manual',
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
      const invoiceResult = await this.settleInvoice(found.invoice, plan, {
        notifyEmail: found.invoice?.email || found.customer.email || undefined,
        reason: claimed.reason ?? undefined,
      });

      await this.db
        .update(refund)
        .set({
          allowanceNo: invoiceResult.allowanceNo,
          invoiceAction: invoiceResult.action,
          invoiceError: invoiceResult.error,
        })
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

      if (plan.isFull)
        await tx
          .update(order)
          .set({ orderStatus: 'OrderReturned' })
          .where(eq(order.id, claimed.orderId));

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
    } catch (error) {
      this.logger.error('退款補正失敗', error);
    } finally {
      this.repairing = false;
    }
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
      );

    for (const created of interrupted) {
      const found = await this.db.query.order.findFirst({
        where: eq(order.id, created.orderId),
        with: { invoice: true },
      });
      if (!found) continue;

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
      );
    if (!ambiguous.length) return;

    const unresolved = await this.reconcilePending(ambiguous);

    if (unresolved.length)
      this.logger.error(
        `有 ${unresolved.length} 筆退款停在未確認狀態，請至綠界後台核對是否已退款：${unresolved
          .map(({ id, orderId }) => `${id}（訂單 ${orderId}）`)
          .join('、')}`,
      );
  }

  /**
   * 送出退刷後失聯的那些退款，向綠界問出真實結果。
   * 回傳仍然問不出結果的，交給呼叫端告警。
   */
  private async reconcilePending(
    pending: { amount: string; id: string; orderId: string }[],
  ): Promise<{ id: string; orderId: string }[]> {
    if (!this.ecpayQueryCreditDetailService.isAvailable) return pending;
    if (Date.now() < this.rateLimitedUntil) return pending;

    const unresolved: { id: string; orderId: string }[] = [];

    for (const [index, row] of pending
      .slice(0, QUERY_LIMIT_PER_RUN)
      .entries()) {
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

    return [...unresolved, ...pending.slice(QUERY_LIMIT_PER_RUN)];
  }

  private async resolvePending(row: {
    amount: string;
    id: string;
    orderId: string;
  }): Promise<boolean> {
    const found = await this.db.query.order.findFirst({
      where: eq(order.id, row.orderId),
      with: { invoice: true },
    });
    if (!found?.authorizationNo) return false;

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
      // 沒退成，紀錄留著會一直佔住這些品項的可退數量
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
    { notifyEmail, reason }: { notifyEmail?: string; reason?: string },
  ): Promise<InvoiceSettlement> {
    if (
      !data ||
      data.status !== 'issued' ||
      !data.invoiceNumber ||
      !data.invoiceDate
    )
      return { action: 'none', allowanceNo: null, error: null };

    const allowances = await this.db
      .select({
        id: invoiceAllowance.id,
        remainingAmount: invoiceAllowance.remainingAmount,
      })
      .from(invoiceAllowance)
      .where(eq(invoiceAllowance.invoiceId, data.id))
      .orderBy(desc(invoiceAllowance.createdAt));

    const invoiceDateText = toInvoiceDateText(data.invoiceDate);

    const voidable =
      plan.isFull &&
      !allowances.length &&
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

          await this.db
            .update(invoice)
            .set({ status: 'voided', voidedAt: new Date() })
            .where(eq(invoice.id, data.id));

          return { action: 'voided', allowanceNo: null, error: null };
        } catch (error) {
          this.logger.warn(
            `發票 ${data.invoiceNumber} 作廢失敗，改開折讓：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (plan.amount <= 0)
        return { action: 'none', allowanceNo: null, error: null };

      this.assertAllowanceHeadroom(allowances[0], plan.amount);

      const result = await this.ecpayAllowanceInvoiceService.allowanceInvoice({
        AllowanceAmount: plan.amount,
        AllowanceNotify: notifyEmail ? 'E' : 'N',
        InvoiceDate: invoiceDateText,
        InvoiceNo: data.invoiceNumber,
        Items: this.buildAllowanceItems(plan),
        NotifyMail: notifyEmail,
        Reason: reason || DEFAULT_INVOICE_REASON,
      });

      await this.db.insert(invoiceAllowance).values({
        id: randomUUID(),
        allowanceNo: result.IA_Allow_No,
        amount: String(plan.amount),
        invoiceId: data.id,
        issuedAt: new Date(
          `${result.IA_Date.replace(' ', 'T')}${STORE_UTC_OFFSET}`,
        ),
        remainingAmount: String(result.IA_Remain_Allowance_Amt),
      });

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

      return { action: 'failed', allowanceNo: null, error: message };
    }
  }

  private assertAllowanceHeadroom(
    latest: { remainingAmount: string } | undefined,
    amount: number,
  ): void {
    if (!latest) return;

    const remaining = Number(latest.remainingAmount);
    if (!Number.isFinite(remaining) || amount <= remaining) return;

    throw new Error(
      this.i18n.t('common.refunds.allowanceExceeded', {
        args: { amount, remaining },
        lang: I18nContext.current()?.lang,
      }),
    );
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
