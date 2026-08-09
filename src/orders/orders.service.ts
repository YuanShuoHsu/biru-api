import { randomBytes, randomUUID } from 'crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
  inArray,
  lt,
  sql,
} from 'drizzle-orm';
import type { OrderStatus } from 'src/db/schema/orders';
import { ORDER_FLOW_STATUSES, order, orderItem } from 'src/db/schema/orders';
import { member, organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import {
  STORE_UTC_OFFSET,
  STORE_UTC_OFFSET_MS,
} from 'src/common/constants/timezone';

import { isAuthorized } from 'src/auth/permissions';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import { sumOrderItems } from 'src/common/utils/order-items';
import { CouponsService } from 'src/coupons/coupons.service';
import { ORDER_STATUS_UPDATED_EVENT } from 'src/events/order-status-updated.event';

import {
  ADMIN_BOARD_COLUMN_LIMIT,
  type AdminOrderBoardColumnDto,
} from './dto/admin-order-board-response.dto';
import type { AdminOrderResponseDto } from './dto/admin-order-response.dto';
import type {
  CreateOrderCustomerDto,
  CreateOrderDto,
} from './dto/create-order.dto';
import {
  ORDER_BOARD_STATUSES,
  type OrderBoardItemDto,
  type OrderBoardStatus,
} from './dto/order-board-response.dto';
import {
  ORDER_DATE_FILTER_FIELDS,
  ORDER_ENUM_FILTER_FIELDS,
  ORDER_NUMBER_FILTER_FIELDS,
  ORDER_STRING_FILTER_FIELDS,
  type OrderPaginationQueryDto,
} from './dto/order-pagination-query.dto';
import type {
  OrderResponseDto,
  UserOrderResponseDto,
} from './dto/order-response.dto';
import type { UserOrderPaginationQueryDto } from './dto/user-order-pagination-query.dto';

import { OrderPricingService } from './order-pricing.service';
import { getAvailableTransitions, toAdminOrder } from './order-transitions';
import { POINTS_SNAPSHOT_SET } from './points-snapshot';

const dateStamp = (): string =>
  new Date(Date.now() + STORE_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');

const startOfToday = (): Date => {
  const stamp = dateStamp();

  return new Date(
    `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T00:00:00${STORE_UTC_OFFSET}`,
  );
};

const generateConfirmationNumber = (): string =>
  `ORD${dateStamp()}${randomBytes(4).toString('hex').toUpperCase()}`;

const PAYMENT_WINDOW_MS = 60 * 60 * 1000;

const BOARD_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly couponsService: CouponsService,
    private readonly orderPricingService: OrderPricingService,
    private readonly eventEmitter: EventEmitter2,
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
    if (dto.mode === 'pickup' && dto.payment === 'Cash')
      throw new BadRequestException('Cash is unavailable for this order mode');

    const isDineIn = dto.mode === 'dineIn';

    const org = await this.getOrgBySlug(organizationSlug);

    const orderItemsData = await this.orderPricingService.resolveOrderItems(
      org.id,
      dto.items,
      dto.mode,
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

    const result = await this.db.transaction(async (tx) => {
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
          subtotal: subtotal.toFixed(2),
          userId,
          partySize: isDineIn ? dto.partySize : null,
          tableNumber: isDineIn ? dto.tableNumber : null,
          ...(applied && {
            discount: applied.discount.toFixed(2),
            discountCode: applied.coupon.code,
          }),
          ...(total <= 0 && {
            orderStatus: 'OrderProcessing' as const,
            paymentDate: new Date(),
            // 付款當下的點數設定快照
            amountPerPoint: org.amountPerPoint,
            pointsValidityYears: org.pointsValidityYears,
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

    this.eventEmitter.emit(ORDER_STATUS_UPDATED_EVENT, {
      orderId: result.id,
      orderStatus: result.orderStatus,
      organizationId: org.id,
    });

    return result;
  }

  async listOrders(
    organizationSlug: string,
    query: OrderPaginationQueryDto = {},
  ): Promise<{ data: AdminOrderResponseDto[]; total: number }> {
    const org = await this.getOrgBySlug(organizationSlug);

    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      sortBy,
      sortDirection = 'desc',
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
      tableNumber: order.tableNumber,
      total: order.total,
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
            ORDER_NUMBER_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: ORDER_ENUM_FILTER_FIELDS,
        fieldMap: orderFieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(order.orderNumber, `%${value}%`),
          ilike(sql`${order.confirmationNumber}`, `%${value}%`),
          ilike(sql`${order.customer}->>'name'`, `%${value}%`),
          ilike(sql`${order.tableNumber}::text`, `%${value}%`),
          ilike(localTimeText(order.paymentDate), `%${value}%`),
          ilike(localTimeText(order.createdAt), `%${value}%`),
          ilike(sql`${order.total}::text`, `%${value}%`),
        ],
      }),
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

    return { data: data.map(toAdminOrder), total };
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
    userId: string | null,
  ): Promise<OrderResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    const found = await this.db.query.order.findFirst({
      where: and(eq(order.id, orderId), eq(order.sellerId, org.id)),
      with: { items: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    if (found.userId && found.userId !== userId) {
      const membership = userId
        ? await this.db.query.member.findFirst({
            where: and(
              eq(member.organizationId, org.id),
              eq(member.userId, userId),
            ),
            columns: { role: true },
          })
        : null;

      if (!membership || !isAuthorized(membership.role, { order: ['read'] }))
        throw new ForbiddenException();
    }

    return found;
  }

  async listAdminBoard(
    organizationSlug: string,
  ): Promise<AdminOrderBoardColumnDto[]> {
    const org = await this.getOrgBySlug(organizationSlug);

    return Promise.all(
      ORDER_FLOW_STATUSES.map(async (orderStatus) => ({
        orderStatus,
        orders: (
          await this.db.query.order.findMany({
            where: and(
              eq(order.sellerId, org.id),
              eq(order.orderStatus, orderStatus),
              orderStatus === 'OrderPaymentDue'
                ? eq(order.paymentMethod, 'Cash')
                : undefined,
            ),
            orderBy: [desc(order.createdAt)],
            limit: ADMIN_BOARD_COLUMN_LIMIT,
            with: { items: true },
          })
        ).map(toAdminOrder),
      })),
    );
  }

  async listPublicBoard(
    organizationSlug: string,
  ): Promise<OrderBoardItemDto[]> {
    const org = await this.getOrgBySlug(organizationSlug);

    return this.listPublicBoardByOrganizationId(org.id);
  }

  listPublicBoardByOrganizationId(
    organizationId: string,
  ): Promise<OrderBoardItemDto[]> {
    return this.db
      .select({
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: sql<OrderBoardStatus>`${order.orderStatus}`,
      })
      .from(order)
      .where(
        and(
          eq(order.sellerId, organizationId),
          gte(order.createdAt, new Date(Date.now() - BOARD_WINDOW_MS)),
          inArray(order.orderStatus, [...ORDER_BOARD_STATUSES]),
        ),
      )
      .orderBy(asc(order.createdAt));
  }

  async getOrderStatus(orderId: string): Promise<{ orderStatus: OrderStatus }> {
    const found = await this.db.query.order.findFirst({
      where: eq(order.id, orderId),
      columns: { orderStatus: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    return found;
  }

  async applyTransition(
    organizationSlug: string,
    orderId: string,
    toStatus: OrderStatus,
  ): Promise<AdminOrderResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    const found = await this.db.query.order.findFirst({
      where: and(eq(order.id, orderId), eq(order.sellerId, org.id)),
      with: { items: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    const rule = getAvailableTransitions(found).find(
      (available) => available.toStatus === toStatus,
    );
    const error = `Order in ${found.orderStatus} cannot be set to ${toStatus}`;
    if (!rule) throw new BadRequestException(error);

    const updated = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(order)
        .set({ orderStatus: toStatus, ...rule.extraSet?.() })
        .where(
          and(eq(order.id, orderId), eq(order.orderStatus, rule.fromStatus)),
        )
        .returning();
      if (!updated) throw new BadRequestException(error);

      if (rule.restoresCoupon && updated.discountCode)
        await this.couponsService.restore(tx, {
          code: updated.discountCode,
          orderId,
        });

      return updated;
    });

    this.eventEmitter.emit(ORDER_STATUS_UPDATED_EVENT, {
      orderId,
      orderStatus: toStatus,
      organizationId: org.id,
    });

    return toAdminOrder({ ...found, ...updated });
  }

  async updateOrderCustomer(
    organizationSlug: string,
    orderId: string,
    customer: CreateOrderCustomerDto,
  ): Promise<OrderResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    const found = await this.db.query.order.findFirst({
      where: and(eq(order.id, orderId), eq(order.sellerId, org.id)),
      with: { items: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    const [updated] = await this.db
      .update(order)
      .set({ customer })
      .where(eq(order.id, orderId))
      .returning();

    return { ...found, ...updated };
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
    const orderStatus: OrderStatus = succeeded
      ? 'OrderProcessing'
      : 'OrderProblem';

    const updated = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(order)
        .set({
          orderStatus,
          paymentDate: body.PaymentDate
            ? new Date(
                `${body.PaymentDate.replace(/\//g, '-').replace(' ', 'T')}+08:00`,
              )
            : undefined,
          paymentMethodId: body.card4no || undefined,
          tradeNo: body.TradeNo,
          ...(succeeded && POINTS_SNAPSHOT_SET),
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
        });

      return updated;
    });

    if (updated)
      this.eventEmitter.emit(ORDER_STATUS_UPDATED_EVENT, {
        orderId: updated.id,
        orderStatus,
        organizationId: updated.sellerId,
      });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelUnpaidOrders(): Promise<void> {
    const cancelled = await this.db.transaction(async (tx) => {
      const cancelled = await tx
        .update(order)
        .set({ orderStatus: 'OrderCancelled' })
        .where(
          and(
            eq(order.orderStatus, 'OrderPaymentDue'),
            lt(order.createdAt, new Date(Date.now() - PAYMENT_WINDOW_MS)),
          ),
        )
        .returning({
          discountCode: order.discountCode,
          id: order.id,
          sellerId: order.sellerId,
        });

      for (const { discountCode, id } of cancelled)
        if (discountCode)
          await this.couponsService.restore(tx, {
            code: discountCode,
            orderId: id,
          });

      return cancelled;
    });

    for (const { id, sellerId } of cancelled)
      this.eventEmitter.emit(ORDER_STATUS_UPDATED_EVENT, {
        orderId: id,
        orderStatus: 'OrderCancelled',
        organizationId: sellerId,
      });

    if (cancelled.length)
      this.logger.log(`自動取消 ${cancelled.length} 筆逾時未付款訂單`);
  }
}
