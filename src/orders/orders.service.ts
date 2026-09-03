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
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { invoice } from 'src/db/schema/invoices';
import type { OrderStatus, PaymentMethod } from 'src/db/schema/orders';
import { ORDER_FLOW_STATUSES, order, orderItem } from 'src/db/schema/orders';
import type { Organization } from 'src/db/schema/organizations';
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
import { toActiveInvoice } from 'src/common/utils/invoices';
import {
  getMinutesUntilClose,
  isWithinOpeningHours,
} from 'src/common/utils/opening-hours';
import { sumOrderItems } from 'src/common/utils/order-items';
import { CouponsService } from 'src/coupons/coupons.service';
import { ECPAY_PENDING_RTN_CODES } from 'src/ecpay/dto/return-ecpay.dto';
import { ORDER_PAID_EVENT } from 'src/events/order-paid.event';
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

const dateStamp = (at: Date = new Date()): string =>
  new Date(at.getTime() + STORE_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');

const startOfDay = (at: Date = new Date()): Date => {
  const stamp = dateStamp(at);

  return new Date(
    `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T00:00:00${STORE_UTC_OFFSET}`,
  );
};

const DAY_MS = 24 * 60 * 60 * 1000;

const generateConfirmationNumber = (): string =>
  `ORD${dateStamp()}${randomBytes(4).toString('hex').toUpperCase()}`;

const PICKUP_MINUTES_STEP = 15;

const PICKUP_LEAD_TOLERANCE_MS = 60 * 1000;

export const PAYMENT_WINDOW_MS = 60 * 60 * 1000;

const MIN_PAYMENT_WINDOW_MS = 10 * 60 * 1000;

const timestampParam = (at: Date): SQL =>
  sql`${order.createdAt.mapToDriverValue(at)}`;

const PAYMENT_DEADLINE = sql`GREATEST(
  ${order.createdAt} + make_interval(secs => ${MIN_PAYMENT_WINDOW_MS / 1000}),
  LEAST(
    ${order.createdAt} + make_interval(secs => ${PAYMENT_WINDOW_MS / 1000}),
    ${order.pickupTime} - make_interval(mins => ${organization.pickupLeadMinutes})
  )
)`.mapWith(order.createdAt);

const paymentDeadlineOf = (
  createdAt: Date,
  pickupTime: Date | null,
  leadMinutes: number,
): Date => {
  const latest = createdAt.getTime() + PAYMENT_WINDOW_MS;
  if (!pickupTime) return new Date(latest);

  return new Date(
    Math.max(
      createdAt.getTime() + MIN_PAYMENT_WINDOW_MS,
      Math.min(latest, pickupTime.getTime() - leadMinutes * 60 * 1000),
    ),
  );
};

export type PaymentResultOutcome = 'handled' | 'ignored' | 'unmatched';

const PROBLEM_RECHECK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const toPaymentDate = (value?: string): Date | undefined => {
  if (!value) return undefined;

  const parsed = new Date(
    `${value.replace(/\//g, '-').replace(' ', 'T')}${STORE_UTC_OFFSET}`,
  );

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const BOARD_AT = sql`COALESCE(${order.pickupTime}, ${order.createdAt})`;

const BOARD_WINDOW_MS = 24 * 60 * 60 * 1000;

const PUBLIC_BOARD_LEAD_MS = 30 * 60 * 1000;
const ADMIN_BOARD_LEAD_MS = 24 * 60 * 60 * 1000;

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

  private async findOrderByIdempotencyKey(
    db: Pick<DrizzleDB, 'query'>,
    sellerId: string,
    idempotencyKey: string,
  ) {
    const found = await db.query.order.findFirst({
      where: and(
        eq(order.sellerId, sellerId),
        eq(order.idempotencyKey, idempotencyKey),
      ),
      with: { invoices: true, items: true },
    });

    return found && toActiveInvoice(found);
  }

  private resolvePickupTime(org: Organization, value?: string): Date {
    if (!value) throw new BadRequestException('pickupTime is required');

    const now = Date.now();
    const leadMs = Math.max(org.pickupLeadMinutes, 0) * 60 * 1000;

    const pickupTime = new Date(value);

    if (pickupTime.getTime() % (PICKUP_MINUTES_STEP * 60 * 1000) !== 0)
      throw new BadRequestException('pickupTime is not on the pickup interval');

    if (pickupTime.getTime() < now + leadMs - PICKUP_LEAD_TOLERANCE_MS)
      throw new BadRequestException('pickupTime is too soon');

    const advanceDays = Math.max(org.pickupMaxAdvanceDays, 0);
    const advanceLimit = startOfDay().getTime() + (advanceDays + 1) * DAY_MS;
    if (pickupTime.getTime() >= advanceLimit)
      throw new BadRequestException('pickupTime is too far ahead');

    if (!isWithinOpeningHours(org.openingHours, pickupTime))
      throw new BadRequestException('pickupTime is outside opening hours');

    if (
      getMinutesUntilClose(org.openingHours, pickupTime) <
      Math.max(org.pickupCutoffMinutes, 0)
    )
      throw new BadRequestException('pickupTime is too close to closing time');

    return pickupTime;
  }

  async createOrder(
    organizationSlug: string,
    dto: CreateOrderDto,
    userId: string | null,
    idempotencyKey: string | null,
  ): Promise<OrderResponseDto> {
    if (dto.mode === 'pickup' && dto.payment === 'Cash')
      throw new BadRequestException('Cash is unavailable for this order mode');

    const isDineIn = dto.mode === 'dineIn';
    const isPickup = dto.mode === 'pickup';

    if (!isPickup && dto.pickupTime)
      throw new BadRequestException(
        'pickupTime is unavailable for this order mode',
      );

    const org = await this.getOrgBySlug(organizationSlug);

    const replayed = idempotencyKey
      ? await this.findOrderByIdempotencyKey(this.db, org.id, idempotencyKey)
      : null;
    if (replayed) return replayed;

    const pickupTime = isPickup
      ? this.resolvePickupTime(org, dto.pickupTime)
      : null;

    const orderItemsData = await this.orderPricingService.resolveOrderItems(
      org.id,
      dto.items,
      dto.mode,
      pickupTime ?? new Date(),
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

      const duplicate = idempotencyKey
        ? await this.findOrderByIdempotencyKey(tx, org.id, idempotencyKey)
        : null;
      if (duplicate) return duplicate;

      const pickupDayStart = startOfDay(pickupTime ?? undefined);
      const [{ value: pickupDayCount }] = await tx
        .select({ value: count() })
        .from(order)
        .where(
          and(
            eq(order.sellerId, org.id),
            gte(BOARD_AT, timestampParam(pickupDayStart)),
            lt(
              BOARD_AT,
              timestampParam(new Date(pickupDayStart.getTime() + DAY_MS)),
            ),
          ),
        );

      const [created] = await tx
        .insert(order)
        .values({
          id: orderId,
          sellerId: org.id,
          idempotencyKey,
          mode: dto.mode,
          orderNumber: String(pickupDayCount + 1),
          customer: dto.customer,
          paymentMethod: dto.payment,
          orderStatus: 'OrderPaymentDue',
          confirmationNumber,
          subtotal: subtotal.toFixed(2),
          userId,
          partySize: isDineIn ? dto.partySize : null,
          pickupTime,
          tableNumber: isDineIn ? dto.tableNumber : null,
          ...(applied && {
            discount: applied.discount.toFixed(2),
            discountCode: applied.coupon.code,
          }),
          ...(total <= 0 && {
            orderStatus: 'OrderProcessing' as const,
            paymentDate: new Date(),
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

      const [createdInvoice] =
        total > 0
          ? await tx
              .insert(invoice)
              .values({
                id: randomUUID(),
                orderId,
                type: dto.invoice.type,
                carrierType: dto.invoice.carrierType,
                carrierNum: dto.invoice.carrierNum,
                email: dto.invoice.email,
                customerIdentifier: dto.invoice.customerIdentifier,
                customerName: dto.invoice.customerName,
                customerAddr: dto.invoice.customerAddr,
                donateCode: dto.invoice.donateCode,
              })
              .returning()
          : [null];

      return { ...created, invoice: createdInvoice, items };
    });

    if (result.id === orderId)
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
      customerTelephone: sql`${order.customer}->>'telephone'`,
      customerEmail: sql`${order.customer}->>'email'`,
      mode: sql`${order.mode}::text`,
      paymentMethod: sql`${order.paymentMethod}::text`,
      orderStatus: sql`${order.orderStatus}::text`,
      paymentDate: order.paymentDate,
      pickupTime: order.pickupTime,
      createdAt: order.createdAt,
      tableNumber: order.tableNumber,
      total: order.total,
      invoiceType: sql`(select i.type::text from ${invoice} i where i.order_id = ${order.id} and i.status <> 'voided')`,
      invoiceStatus: sql`(select i.status::text from ${invoice} i where i.order_id = ${order.id} and i.status <> 'voided')`,
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
          ilike(sql`${order.customer}->>'telephone'`, `%${value}%`),
          ilike(sql`${order.customer}->>'email'`, `%${value}%`),
          ilike(sql`${order.tableNumber}::text`, `%${value}%`),
          ilike(localTimeText(order.paymentDate), `%${value}%`),
          ilike(localTimeText(order.pickupTime), `%${value}%`),
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
        with: { invoices: true, items: true },
      }),
      this.db.select({ total: count() }).from(order).where(where),
    ]);

    return {
      data: data.map((found) => toAdminOrder(toActiveInvoice(found))),
      total,
    };
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
    const now = Date.now();

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
              gte(BOARD_AT, timestampParam(new Date(now - BOARD_WINDOW_MS))),
              or(
                isNull(order.pickupTime),
                lt(order.pickupTime, new Date(now + ADMIN_BOARD_LEAD_MS)),
              ),
            ),
            orderBy: [asc(BOARD_AT)],
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
    const now = Date.now();

    return this.db
      .select({
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: sql<OrderBoardStatus>`${order.orderStatus}`,
        mode: order.mode,
        pickupTime: order.pickupTime,
        tableNumber: order.tableNumber,
      })
      .from(order)
      .where(
        and(
          eq(order.sellerId, organizationId),
          gte(BOARD_AT, timestampParam(new Date(now - BOARD_WINDOW_MS))),
          or(
            isNull(order.pickupTime),
            lt(order.pickupTime, new Date(now + PUBLIC_BOARD_LEAD_MS)),
          ),
          inArray(order.orderStatus, [...ORDER_BOARD_STATUSES]),
        ),
      )
      .orderBy(asc(BOARD_AT));
  }

  async getOrderStatus(orderId: string): Promise<{ orderStatus: OrderStatus }> {
    const found = await this.db.query.order.findFirst({
      where: eq(order.id, orderId),
      columns: { orderStatus: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    return found;
  }

  async applyTransitions(
    organizationSlug: string,
    orderIds: string[],
    toStatus: OrderStatus,
  ): Promise<AdminOrderResponseDto[]> {
    const org = await this.getOrgBySlug(organizationSlug);

    const found = await this.db.query.order.findMany({
      where: and(inArray(order.id, orderIds), eq(order.sellerId, org.id)),
      with: { items: true },
    });
    if (found.length !== orderIds.length)
      throw new NotFoundException('Order not found');

    const planned = found.map((current) => {
      const rule = getAvailableTransitions(current).find(
        (available) => available.toStatus === toStatus,
      );
      if (!rule)
        throw new BadRequestException(
          `Order in ${current.orderStatus} cannot be set to ${toStatus}`,
        );

      return { current, rule };
    });

    const updated = await this.db.transaction(async (tx) => {
      const results: AdminOrderResponseDto[] = [];

      for (const { current, rule } of planned) {
        const [updated] = await tx
          .update(order)
          .set({ orderStatus: toStatus, ...rule.extraSet?.() })
          .where(
            and(
              eq(order.id, current.id),
              eq(order.orderStatus, rule.fromStatus),
            ),
          )
          .returning();
        if (!updated)
          throw new BadRequestException(
            `Order in ${current.orderStatus} cannot be set to ${toStatus}`,
          );

        if (rule.restoresCoupon && updated.discountCode)
          await this.couponsService.restore(tx, {
            code: updated.discountCode,
            orderId: current.id,
          });

        results.push(toAdminOrder({ ...current, ...updated }));
      }

      return results;
    });

    for (const { id: orderId } of updated)
      this.eventEmitter.emit(ORDER_STATUS_UPDATED_EVENT, {
        orderId,
        orderStatus: toStatus,
        organizationId: org.id,
      });

    for (const { current, rule } of planned)
      if (rule.recordsPayment)
        this.eventEmitter.emit(ORDER_PAID_EVENT, { orderId: current.id });

    return updated;
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
      with: { items: true, seller: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    const { confirmationNumber } = found;
    if (found.paymentMethod === 'Cash' || !confirmationNumber)
      throw new BadRequestException('Order does not require online payment');

    const deadline = paymentDeadlineOf(
      found.createdAt,
      found.pickupTime,
      found.seller.pickupLeadMinutes,
    );
    if (
      found.orderStatus !== 'OrderPaymentDue' ||
      Date.now() > deadline.getTime()
    )
      throw new BadRequestException('Order is not awaiting payment');

    return { ...found, confirmationNumber };
  }

  async recordPaymentResult(
    body: Record<string, string>,
  ): Promise<PaymentResultOutcome> {
    if (body.SimulatePaid === '1') return 'ignored';

    const succeeded = body.RtnCode === '1';

    if (!succeeded && ECPAY_PENDING_RTN_CODES.has(body.RtnCode)) {
      this.logger.warn(
        `綠界回報付款結果待確認：${body.MerchantTradeNo}（${body.RtnCode} ${body.RtnMsg}），維持待付款交給對帳`,
      );

      return 'ignored';
    }

    const orderStatus: OrderStatus = succeeded
      ? 'OrderProcessing'
      : 'OrderProblem';

    const updated = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(order)
        .set({
          authorizationNo: body.gwsr || undefined,
          orderStatus,
          paymentDate: toPaymentDate(body.PaymentDate),
          paymentMethodId: body.card4no || undefined,
          tradeNo: body.TradeNo,
          ...(succeeded && POINTS_SNAPSHOT_SET),
        })
        .where(
          and(
            eq(order.confirmationNumber, body.MerchantTradeNo),
            succeeded
              ? or(
                  eq(order.orderStatus, 'OrderPaymentDue'),
                  and(
                    eq(order.orderStatus, 'OrderProblem'),
                    isNull(order.discountCode),
                  ),
                )
              : eq(order.orderStatus, 'OrderPaymentDue'),
            ...(succeeded
              ? [sql`${order.total} = ${Number(body.TradeAmt)}`]
              : []),
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

    if (!updated) return this.classifyUnmatchedPayment(body, succeeded);

    this.eventEmitter.emit(ORDER_STATUS_UPDATED_EVENT, {
      orderId: updated.id,
      orderStatus,
      organizationId: updated.sellerId,
    });

    if (succeeded)
      this.eventEmitter.emit(ORDER_PAID_EVENT, { orderId: updated.id });

    return 'handled';
  }

  private async classifyUnmatchedPayment(
    body: Record<string, string>,
    succeeded: boolean,
  ): Promise<PaymentResultOutcome> {
    const found = await this.db.query.order.findFirst({
      where: eq(order.confirmationNumber, body.MerchantTradeNo),
      columns: {
        discountCode: true,
        orderStatus: true,
        paymentDate: true,
        total: true,
      },
    });

    if (!found) {
      this.logger.error(
        `綠界付款通知找不到對應訂單：${body.MerchantTradeNo}（通知金額 ${body.TradeAmt}）`,
      );

      return 'unmatched';
    }

    if (found.paymentDate) {
      this.logger.log(
        `綠界付款通知重複送達，訂單已認列：${body.MerchantTradeNo}`,
      );

      return 'handled';
    }

    if (!succeeded && found.orderStatus === 'OrderProblem') {
      this.logger.log(
        `綠界付款失敗通知重複送達，訂單已標記異常：${body.MerchantTradeNo}`,
      );

      return 'handled';
    }

    if (Number(found.total) !== Number(body.TradeAmt))
      this.logger.error(
        `綠界付款通知金額與訂單不符：${body.MerchantTradeNo}（訂單 ${found.total}，通知 ${body.TradeAmt}）`,
      );
    else if (succeeded && found.orderStatus === 'OrderProblem')
      this.logger.error(
        `綠界回報已付款但訂單為異常，用了優惠券 ${found.discountCode} 所以不自動補正，需人工確認券的使用狀態：${body.MerchantTradeNo}`,
      );
    else
      this.logger.error(
        `綠界付款通知對應的訂單不在待付款狀態：${body.MerchantTradeNo}（目前 ${found.orderStatus}，通知金額 ${body.TradeAmt}）`,
      );

    return 'unmatched';
  }

  async findOrdersToReconcile(limit: number): Promise<
    {
      confirmationNumber: string | null;
      id: string;
      orderStatus: OrderStatus;
      paymentDeadline: Date;
      paymentMethod: PaymentMethod;
    }[]
  > {
    const now = Date.now();

    return this.db
      .select({
        confirmationNumber: order.confirmationNumber,
        id: order.id,
        orderStatus: order.orderStatus,
        paymentDeadline: PAYMENT_DEADLINE,
        paymentMethod: order.paymentMethod,
      })
      .from(order)
      .innerJoin(organization, eq(order.sellerId, organization.id))
      .where(
        or(
          and(
            eq(order.orderStatus, 'OrderPaymentDue'),
            lt(PAYMENT_DEADLINE, timestampParam(new Date(now))),
          ),
          and(
            eq(order.orderStatus, 'OrderProblem'),
            isNull(order.reconciledAt),
            gte(order.createdAt, new Date(now - PROBLEM_RECHECK_WINDOW_MS)),
          ),
        ),
      )
      .orderBy(asc(order.createdAt))
      .limit(limit);
  }

  async markReconciled(orderIds: string[]): Promise<void> {
    if (!orderIds.length) return;

    await this.db
      .update(order)
      .set({ reconciledAt: new Date() })
      .where(inArray(order.id, orderIds));
  }

  async cancelOrders(orderIds: string[]): Promise<void> {
    if (!orderIds.length) return;

    const cancelled = await this.db.transaction(async (tx) => {
      const cancelled = await tx
        .update(order)
        .set({ orderStatus: 'OrderCancelled' })
        .where(
          and(
            inArray(order.id, orderIds),
            eq(order.orderStatus, 'OrderPaymentDue'),
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
