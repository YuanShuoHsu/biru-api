import { randomBytes, randomUUID } from 'crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import {
  Column,
  SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { order, orderItem } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { buildFilterCondition } from 'src/common/utils/data-grid-filters';
import { sumOrderItems } from 'src/common/utils/order-items';
import { CouponsService } from 'src/coupons/coupons.service';

import type { CreateOrderDto } from './dto/create-order.dto';
import {
  ORDER_DATE_FILTER_FIELDS,
  ORDER_ENUM_FILTER_FIELDS,
  ORDER_STRING_FILTER_FIELDS,
  type OrderPaginationQueryDto,
} from './dto/order-pagination-query.dto';
import type {
  OrderResponseDto,
  UserOrderResponseDto,
} from './dto/order-response.dto';
import type { UserOrderPaginationQueryDto } from './dto/user-order-pagination-query.dto';

import { OrderPricingService } from './order-pricing.service';

const dateStamp = (): string =>
  new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');

const startOfToday = (): Date => {
  const stamp = dateStamp();

  return new Date(
    `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T00:00:00+08:00`,
  );
};

const generateConfirmationNumber = (): string =>
  `ORD${dateStamp()}${randomBytes(4).toString('hex').toUpperCase()}`;

const PAYMENT_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly couponsService: CouponsService,
    private readonly orderPricingService: OrderPricingService,
  ) {}

  private async getOrgBySlug(slug: string) {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, slug),
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async createOrder(
    organizationSlug: string,
    dto: CreateOrderDto,
    userId: string | null,
  ): Promise<OrderResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    const orderItemsData = await this.orderPricingService.resolveOrderItems(
      org.id,
      dto.items,
    );

    const subtotal = Math.round(sumOrderItems(orderItemsData));
    const applied = dto.discountCode
      ? await this.couponsService.getApplicableCoupon(
          org.id,
          dto.discountCode,
          orderItemsData,
          userId,
        )
      : null;
    const total = subtotal - (applied?.discount ?? 0);

    const orderId = randomUUID();
    const confirmationNumber = generateConfirmationNumber();

    return this.db.transaction(async (tx) => {
      await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, org.id))
        .for('update');

      const [{ value: todayCount }] = await tx
        .select({ value: count() })
        .from(order)
        .where(
          and(eq(order.sellerId, org.id), gte(order.createdAt, startOfToday())),
        );

      const [created] = await tx
        .insert(order)
        .values({
          id: orderId,
          sellerId: org.id,
          mode: dto.mode,
          orderNumber: String(todayCount + 1),
          customer: dto.customer,
          paymentMethod: dto.payment,
          orderStatus: 'OrderPaymentDue',
          confirmationNumber,
          userId,
          ...(applied && {
            discount: applied.discount.toFixed(2),
            discountCode: applied.coupon.code,
          }),
          ...(total <= 0 && {
            orderStatus: 'OrderProcessing' as const,
            paymentDate: new Date(),
          }),
        })
        .returning();

      if (applied)
        await this.couponsService.redeem(tx, {
          couponId: applied.coupon.id,
          orderId,
          userCouponId: applied.userCouponId,
        });

      const items = await tx
        .insert(orderItem)
        .values(
          orderItemsData.map((i) => ({
            id: i.id,
            addOns: i.addOns,
            menuItemId: i.menuItemId,
            menuItemName: i.menuItemName,
            modifiers: i.modifiers,
            orderId,
            orderQuantity: i.orderQuantity,
            priceCurrency: i.priceCurrency,
            unitPrice: i.unitPrice,
          })),
        )
        .returning();

      return { ...created, items };
    });
  }

  async listOrders(
    organizationSlug: string,
    query: OrderPaginationQueryDto = {},
  ): Promise<{ data: OrderResponseDto[]; total: number }> {
    const org = await this.getOrgBySlug(organizationSlug);

    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterValue,
      sortBy,
      sortDirection = 'desc',
      timezone = 'UTC',
    } = query;

    const orderFieldMap: Record<string, Column | SQL> = {
      orderNumber: order.orderNumber,
      confirmationNumber: order.confirmationNumber,
      customerName: sql`${order.customer}->>'name'`,
      mode: sql`${order.mode}::text`,
      paymentMethod: sql`${order.paymentMethod}::text`,
      orderStatus: sql`${order.orderStatus}::text`,
      paymentDate: order.paymentDate,
      createdAt: order.createdAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] = sortBy
      ? [dir(orderFieldMap[sortBy]), desc(order.createdAt)]
      : [desc(order.createdAt)];

    const where = and(
      eq(order.sellerId, org.id),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            orderFieldMap,
            ORDER_STRING_FILTER_FIELDS,
            ORDER_DATE_FILTER_FIELDS,
            ORDER_ENUM_FILTER_FIELDS,
          )
        : undefined,
      quickFilterValue
        ? or(
            ilike(order.orderNumber, `%${quickFilterValue}%`),
            ilike(sql`${order.confirmationNumber}`, `%${quickFilterValue}%`),
            ilike(sql`${order.customer}->>'name'`, `%${quickFilterValue}%`),
            ilike(
              sql`TO_CHAR(${order.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
              `%${quickFilterValue}%`,
            ),
          )
        : undefined,
    );

    const [data, [{ total }]] = await Promise.all([
      this.db.query.order.findMany({
        where,
        orderBy,
        limit,
        offset,
        with: { items: true },
      }),
      this.db.select({ total: count() }).from(order).where(where),
    ]);

    return { data, total };
  }

  async listUserOrders(
    userId: string,
    query: UserOrderPaginationQueryDto = {},
  ): Promise<{ data: UserOrderResponseDto[]; total: number }> {
    const { limit = 10, offset = 0 } = query;

    const where = eq(order.userId, userId);

    const [data, [{ total }]] = await Promise.all([
      this.db.query.order.findMany({
        where,
        orderBy: [desc(order.createdAt)],
        limit,
        offset,
        with: {
          items: true,
          seller: {
            columns: {
              id: true,
              name: true,
              slug: true,
              logo: true,
              addressCountry: true,
            },
          },
        },
      }),
      this.db.select({ total: count() }).from(order).where(where),
    ]);

    return { data, total };
  }

  async getOrder(
    organizationSlug: string,
    orderId: string,
  ): Promise<OrderResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    const found = await this.db.query.order.findFirst({
      where: and(eq(order.id, orderId), eq(order.sellerId, org.id)),
      with: { items: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    return found;
  }

  async getPayableOrder(
    orderId: string,
  ): Promise<OrderResponseDto & { confirmationNumber: string }> {
    const found = await this.db.query.order.findFirst({
      where: eq(order.id, orderId),
      with: { items: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    const { confirmationNumber } = found;
    if (found.paymentMethod === 'Cash' || !confirmationNumber)
      throw new BadRequestException('Order does not require online payment');
    if (
      found.orderStatus !== 'OrderPaymentDue' ||
      Date.now() - found.createdAt.getTime() > PAYMENT_WINDOW_MS
    )
      throw new BadRequestException('Order is not awaiting payment');

    return { ...found, confirmationNumber };
  }

  async recordPaymentResult(body: Record<string, string>): Promise<void> {
    if (body.SimulatePaid === '1') return;

    const succeeded = body.RtnCode === '1';

    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(order)
        .set({
          orderStatus: succeeded ? 'OrderProcessing' : 'OrderProblem',
          paymentDate: body.PaymentDate
            ? new Date(
                `${body.PaymentDate.replace(/\//g, '-').replace(' ', 'T')}+08:00`,
              )
            : undefined,
          paymentMethodId: body.card4no || undefined,
          tradeNo: body.TradeNo,
        })
        .where(
          and(
            eq(order.confirmationNumber, body.MerchantTradeNo),
            eq(order.orderStatus, 'OrderPaymentDue'),
          ),
        )
        .returning({
          id: order.id,
          discountCode: order.discountCode,
          sellerId: order.sellerId,
        });

      if (!succeeded && updated?.discountCode)
        await this.couponsService.restore(tx, {
          code: updated.discountCode,
          orderId: updated.id,
          organizationId: updated.sellerId,
        });
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelUnpaidOrders(): Promise<void> {
    await this.db.transaction(async (tx) => {
      const cancelled = await tx
        .update(order)
        .set({ orderStatus: 'OrderCancelled' })
        .where(
          and(
            eq(order.orderStatus, 'OrderPaymentDue'),
            lt(order.createdAt, new Date(Date.now() - PAYMENT_WINDOW_MS)),
            ne(order.paymentMethod, 'Cash'),
          ),
        )
        .returning({
          discountCode: order.discountCode,
          id: order.id,
          sellerId: order.sellerId,
        });

      for (const { discountCode, id, sellerId } of cancelled)
        if (discountCode)
          await this.couponsService.restore(tx, {
            code: discountCode,
            orderId: id,
            organizationId: sellerId,
          });

      if (cancelled.length)
        this.logger.log(`自動取消 ${cancelled.length} 筆逾時未付款訂單`);
    });
  }
}
