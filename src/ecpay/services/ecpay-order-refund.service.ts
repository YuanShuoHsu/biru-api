import { randomUUID } from 'crypto';

import { and, desc, eq, lt } from 'drizzle-orm';

import type { AllowanceInvoiceEcpayItemDto } from '../dto/allowance-invoice-ecpay.dto';
import type {
  CreateOrderRefundDto,
  OrderRefundDto,
} from '../dto/order-refund.dto';

import { ITEM_WORD, toInvoiceDateText } from '../utils/ecpay';
import type { RefundPlanTranslate } from '../utils/refund-plan';
import {
  buildRefundPlan,
  earliestVoidableInvoiceDate,
} from '../utils/refund-plan';

import { EcpayAllowanceInvoiceService } from './ecpay-allowance-invoice.service';
import { EcpayDoActionService } from './ecpay-do-action.service';
import { EcpayInvalidInvoiceService } from './ecpay-invalid-invoice.service';

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
const AMBIGUOUS_GRACE_MS = 30 * 60 * 1000;

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

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ecpayDoActionService: EcpayDoActionService,
    private readonly ecpayInvalidInvoiceService: EcpayInvalidInvoiceService,
    private readonly ecpayAllowanceInvoiceService: EcpayAllowanceInvoiceService,
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
    key: 'alreadyRefunded' | 'noEcpayTransaction' | 'notPaid' | 'notRefundable',
  ): string {
    return this.i18n.t(`common.refunds.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  async refundOrder(
    organizationSlug: string,
    orderId: string,
    dto: CreateOrderRefundDto,
    operatorId?: string,
  ): Promise<OrderRefundDto> {
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
    if (created.invoiceAction === null) {
      const invoiceResult = await this.settleInvoice(found.invoice, plan, {
        notifyEmail: found.invoice?.email || found.customer.email || undefined,
        reason: created.reason ?? undefined,
      });

      await this.db
        .update(refund)
        .set({
          allowanceNo: invoiceResult.allowanceNo,
          invoiceAction: invoiceResult.action,
          invoiceError: invoiceResult.error,
        })
        .where(eq(refund.id, created.id));
    }

    await this.db.transaction(async (tx) => {
      await this.pointsService.revokeForOrder(tx, {
        orderBecomesTerminal: plan.isFull,
        orderId: created.orderId,
        ratio: plan.ratio,
      });

      if (plan.isFull && found.discountCode)
        await this.couponsService.restore(tx, {
          code: found.discountCode,
          orderId: created.orderId,
        });

      if (plan.isFull)
        await tx
          .update(order)
          .set({ orderStatus: 'OrderReturned' })
          .where(eq(order.id, created.orderId));

      await tx
        .update(refund)
        .set({ status: 'settled' })
        .where(eq(refund.id, created.id));
    });

    if (plan.isFull)
      this.eventEmitter.emit(ORDER_STATUS_UPDATED_EVENT, {
        orderId: created.orderId,
        orderStatus: 'OrderReturned',
        organizationId: found.sellerId,
      });
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
        and(
          eq(refund.status, 'refunded'),
          lt(refund.updatedAt, new Date(Date.now() - SETTLE_GRACE_MS)),
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
      .select({ id: refund.id, orderId: refund.orderId })
      .from(refund)
      .where(
        and(
          eq(refund.status, 'pending'),
          lt(refund.createdAt, new Date(Date.now() - AMBIGUOUS_GRACE_MS)),
        ),
      );

    if (ambiguous.length)
      this.logger.error(
        `有 ${ambiguous.length} 筆退款停在未確認狀態，請至綠界後台核對是否已退款：${ambiguous
          .map(({ id, orderId }) => `${id}（訂單 ${orderId}）`)
          .join('、')}`,
      );
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
