import { randomUUID } from 'crypto';

import { and, desc, eq } from 'drizzle-orm';

import type { AllowanceInvoiceEcpayItemDto } from '../dto/allowance-invoice-ecpay.dto';
import type {
  CreateOrderRefundDto,
  OrderRefundDto,
} from '../dto/order-refund.dto';

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
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { Invoice } from 'src/db/schema/invoices';
import { invoice, invoiceAllowance } from 'src/db/schema/invoices';
import type { PaymentMethod } from 'src/db/schema/orders';
import { order } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import type {
  RefundInvoiceAction,
  RefundItemSnapshot,
} from 'src/db/schema/refunds';
import { refund } from 'src/db/schema/refunds';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { STORE_UTC_OFFSET } from 'src/common/constants/timezone';
import { CouponsService } from 'src/coupons/coupons.service';
import { ORDER_STATUS_UPDATED_EVENT } from 'src/events/order-status-updated.event';
import { PointsService } from 'src/points/points.service';

const ITEM_WORD = '份';

// 綠界的請退款 API 只支援信用卡；Apple Pay 走信用卡收單故一併嘗試
const ECPAY_REFUNDABLE_METHODS: PaymentMethod[] = ['ApplePay', 'Credit'];

@Injectable()
export class EcpayOrderRefundService {
  private readonly logger = new Logger(EcpayOrderRefundService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ecpayDoActionService: EcpayDoActionService,
    private readonly ecpayInvalidInvoiceService: EcpayInvalidInvoiceService,
    private readonly ecpayAllowanceInvoiceService: EcpayAllowanceInvoiceService,
    private readonly couponsService: CouponsService,
    private readonly pointsService: PointsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
    if (!found.paymentDate)
      throw new ConflictException('Order is not paid yet');
    if (found.orderStatus === 'OrderReturned')
      throw new ConflictException('Order is already fully refunded');

    const previous = await this.db
      .select({ items: refund.items })
      .from(refund)
      .where(eq(refund.orderId, orderId));

    const plan = buildRefundPlan(found, previous, dto.items);

    // 先落庫再退款：錢退出去後若程式崩掉，至少留得下這筆退款存在的事實
    const [created] = await this.db
      .insert(refund)
      .values({
        id: randomUUID(),
        amount: String(plan.amount),
        channel: ECPAY_REFUNDABLE_METHODS.includes(found.paymentMethod)
          ? 'ecpay'
          : 'manual',
        items: plan.isFull ? null : plan.items,
        operatorId,
        orderId,
        reason: dto.reason,
        scope: plan.isFull ? 'full' : 'partial',
      })
      .returning();

    if (created.channel === 'ecpay') {
      if (!found.confirmationNumber || !found.tradeNo) {
        await this.db.delete(refund).where(eq(refund.id, created.id));

        throw new ConflictException(
          'Order has no ECPay transaction to refund against',
        );
      }

      try {
        const result = await this.ecpayDoActionService.refund({
          amount: plan.amount,
          merchantTradeNo: found.confirmationNumber,
          tradeNo: found.tradeNo,
        });

        await this.db
          .update(refund)
          .set({ ecpayRtnCode: result.RtnCode, ecpayRtnMsg: result.RtnMsg })
          .where(eq(refund.id, created.id));
      } catch (error) {
        // 錢沒退成功，留著這筆紀錄會讓下次退款誤以為額度已用掉
        await this.db.delete(refund).where(eq(refund.id, created.id));

        throw error;
      }
    }

    const invoiceResult = await this.settleInvoice(found.invoice, plan);

    await this.db
      .update(refund)
      .set({
        invoiceAction: invoiceResult.action,
        invoiceError: invoiceResult.error,
      })
      .where(eq(refund.id, created.id));

    await this.db.transaction(async (tx) => {
      await this.pointsService.revokeForOrder(tx, {
        orderBecomesTerminal: plan.isFull,
        orderId,
        ratio: plan.ratio,
      });

      if (plan.isFull && found.discountCode)
        await this.couponsService.restore(tx, {
          code: found.discountCode,
          orderId,
        });

      if (plan.isFull)
        await tx
          .update(order)
          .set({ orderStatus: 'OrderReturned' })
          .where(eq(order.id, orderId));
    });

    if (plan.isFull)
      this.eventEmitter.emit(ORDER_STATUS_UPDATED_EVENT, {
        orderId,
        orderStatus: 'OrderReturned',
        organizationId: found.sellerId,
      });

    const [final] = await this.db
      .select()
      .from(refund)
      .where(eq(refund.id, created.id));

    return final;
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
        amount: refund.amount,
        channel: refund.channel,
        createdAt: refund.createdAt,
        invoiceAction: refund.invoiceAction,
        invoiceError: refund.invoiceError,
        items: refund.items,
        reason: refund.reason,
        scope: refund.scope,
      })
      .from(refund)
      .where(eq(refund.orderId, orderId))
      .orderBy(desc(refund.createdAt));
  }

  private async settleInvoice(
    data: Invoice | null,
    plan: {
      allocatedDiscount: number;
      amount: number;
      items: RefundItemSnapshot[];
      isFull: boolean;
    },
  ): Promise<{ action: RefundInvoiceAction; error: string | null }> {
    if (
      !data ||
      data.status !== 'issued' ||
      !data.invoiceNumber ||
      !data.invoiceDate
    )
      return { action: 'none', error: null };

    const existingAllowances = await this.db
      .select({ id: invoiceAllowance.id })
      .from(invoiceAllowance)
      .where(eq(invoiceAllowance.invoiceId, data.id));

    const invoiceDateText = this.toInvoiceDateText(data.invoiceDate);

    // 已折讓過的發票綠界不再讓作廢，跨期的也不行；兩者都只能改開折讓
    const voidable =
      plan.isFull &&
      !existingAllowances.length &&
      data.invoiceDate >= earliestVoidableInvoiceDate(new Date());

    try {
      if (voidable) {
        await this.ecpayInvalidInvoiceService.invalidInvoice({
          InvoiceDate: invoiceDateText,
          InvoiceNo: data.invoiceNumber,
          Reason: '訂單退款',
        });

        await this.db
          .update(invoice)
          .set({ status: 'voided', voidedAt: new Date() })
          .where(eq(invoice.id, data.id));

        return { action: 'voided', error: null };
      }

      const result = await this.ecpayAllowanceInvoiceService.allowanceInvoice({
        AllowanceAmount: plan.amount,
        AllowanceNotify: data.email ? 'E' : 'N',
        InvoiceDate: invoiceDateText,
        InvoiceNo: data.invoiceNumber,
        Items: this.buildAllowanceItems(plan),
        NotifyMail: data.email ?? undefined,
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

      return { action: 'allowance', error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // 錢已經退出去了，發票處理失敗不能讓整筆退款回滾，只能記下來讓店家補處理
      this.logger.error(
        `退款已完成但發票處理失敗（發票 ${data.invoiceNumber}）：${message}`,
      );

      return { action: 'failed', error: message };
    }
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

  private toInvoiceDateText(value: Date): string {
    return new Date(value.getTime() + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }
}
