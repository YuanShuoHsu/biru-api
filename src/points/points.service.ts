import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { coupon, userCoupon, type Coupon } from '../db/schema/coupons.js';
import {
  ORDER_TERMINAL_STATUSES,
  order,
  orderItem,
} from '../db/schema/orders.js';
import { organization } from '../db/schema/organizations.js';
import {
  POINT_SETTING_ID,
  pointSetting,
  pointTransaction,
  type PointTransaction,
} from '../db/schema/points.js';
import { user } from '../db/schema/users.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { MailsService } from '../mails/mails.service.js';

import {
  DAY_MS,
  platformDayNumber,
  platformMidnight,
  toPlatformTime,
} from '../common/constants/timezone.js';
import { withinCapacity, withinValidity } from '../common/utils/coupons.js';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  escapeLike,
  localTimeText,
} from '../common/utils/data-grid-filters.js';
import { getOrganizationIdBySlug } from '../common/utils/organizations.js';

import type { UserCouponResponseDto } from '../coupons/dto/coupon-response.dto.js';

import type { AdjustPointsDto } from './dto/adjust-points.dto.js';
import {
  POINT_TRANSACTION_DATE_FILTER_FIELDS,
  POINT_TRANSACTION_ENUM_FILTER_FIELDS,
  POINT_TRANSACTION_NUMBER_FILTER_FIELDS,
  POINT_TRANSACTION_STRING_FILTER_FIELDS,
  type OrganizationPointTransactionQueryDto,
} from './dto/organization-point-transaction-query.dto.js';
import type { PointsPaginationQueryDto } from './dto/points-pagination-query.dto.js';
import type {
  ExpiringPointsDto,
  MyPointsDto,
  OrganizationPointTransactionDto,
  OrganizationPointTransactionListResponseDto,
  PointAdjustmentLimitDto,
  PointsCouponDto,
} from './dto/points-response.dto.js';

const OWNER_ONLY_ADJUSTMENT_AMOUNT = 3000;

const EXPIRING_SOON_DAYS = 30;

const EXPIRY_REMINDER_FIRST_DAY = 24;

const POINTS_VALIDITY_YEARS = 1;

const maxNonOwnerAdjustPoints = (amountPerPoint: string | null | undefined) => {
  const centsPerPoint = Math.round(Number(amountPerPoint) * 100);
  return centsPerPoint > 0
    ? Math.floor((OWNER_ONLY_ADJUSTMENT_AMOUNT * 100) / centsPerPoint)
    : 0;
};

const isOwnerRole = (memberRole: string) =>
  memberRole.split(',').some((role) => role.trim() === 'owner');

// 沒有快照的訂單只認啟用點數之後付款的，避免回溯補發整段歷史
const earnedFromSnapshotOr = <T>(snapshot: Column, current: Column) =>
  sql<T>`CASE WHEN ${order.amountPerPoint} IS NOT NULL THEN ${snapshot} WHEN ${order.paymentDate} >= ${pointSetting.pointsEnabledAt} THEN ${current} END`;

const EARN_AMOUNT_PER_POINT = earnedFromSnapshotOr<string | null>(
  order.amountPerPoint,
  pointSetting.amountPerPoint,
);

// 未付款訂單付款時才快照目前設定，所以預估用目前設定
const EXPECTED_AMOUNT_PER_POINT = sql<
  string | null
>`CASE WHEN ${order.paymentDate} IS NULL THEN ${pointSetting.amountPerPoint} ELSE ${EARN_AMOUNT_PER_POINT} END`;

const EARN_SUBTOTAL = sql<string>`COALESCE(SUM(${orderItem.unitPrice} * ${orderItem.orderQuantity}), 0)`;

const toExpiresAt = (earnedAt: Date): Date => {
  const earnedDay = toPlatformTime(earnedAt);
  const year = earnedDay.getUTCFullYear() + POINTS_VALIDITY_YEARS;
  const month = earnedDay.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const anniversary = Date.UTC(
    year,
    month,
    Math.min(earnedDay.getUTCDate(), lastDayOfMonth),
  );

  return new Date(platformMidnight(anniversary) + DAY_MS - 1);
};

const expiringByPlatformDay = (
  lots: { expiresAt: Date; remainingPoints: number }[],
  balance: number,
): ExpiringPointsDto[] => {
  const days = new Map<number, ExpiringPointsDto>();
  for (const { expiresAt, remainingPoints } of lots) {
    const day = platformDayNumber(expiresAt.getTime());
    const group = days.get(day) ?? { expiresAt, points: 0 };
    group.points += remainingPoints;
    days.set(day, group);
  }

  let available = Math.max(balance, 0);
  return [...days.values()].flatMap(({ expiresAt, points }) => {
    const shown = Math.min(points, available);
    if (shown <= 0) return [];
    available -= shown;
    return [{ expiresAt, points: shown }];
  });
};

const LOT_CONSUMPTION_ORDER = [
  asc(pointTransaction.expiresAt),
  asc(pointTransaction.createdAt),
  asc(pointTransaction.id),
];

const toCents = (amount: string | null) => Math.round(Number(amount) * 100);

const earnedPoints = (
  subtotal: string,
  discount: string | null,
  amountPerPoint: string | null,
): number => {
  const centsPerPoint = toCents(amountPerPoint);

  return centsPerPoint > 0
    ? Math.floor((toCents(subtotal) - toCents(discount)) / centsPerPoint)
    : 0;
};

const expectedPointsFor = (
  subtotal: string,
  discount: string | null,
  amountPerPoint: string | null,
): number | null =>
  Number(amountPerPoint) > 0
    ? Math.max(earnedPoints(subtotal, discount, amountPerPoint), 0)
    : null;

const toPointsCoupon = (found: Coupon): PointsCouponDto => ({
  id: found.id,
  code: found.code,
  discountCurrency: found.discountCurrency,
  discountType: found.discountType,
  discountValue: found.discountValue,
  isActive: found.isActive,
  minSubtotal: found.minSubtotal,
  pointsCost: found.pointsCost!,
  scope: found.scope,
  validFrom: found.validFrom,
  validThrough: found.validThrough,
});

@Injectable()
export class PointsService {
  private readonly logger = new Logger(PointsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly mails: MailsService,
  ) {}

  private t(
    key:
      | 'adjustOwnerOnly'
      | 'adjustSelf'
      | 'insufficient'
      | 'notEnabled'
      | 'notRedeemable'
      | 'perUserLimitReached',
    args?: Record<string, unknown>,
  ): string {
    return this.i18n.t(`common.points.${key}`, {
      args,
      lang: I18nContext.current()?.lang,
    });
  }

  private tCoupons(key: 'memberNotFound' | 'usedUp'): string {
    return this.i18n.t(`common.coupons.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  // Lazy 入點：已付款且未取消的訂單補入 earn；已取消訂單的點數收回
  private async syncEarned(
    scope: { userId: string } | { organizationId: string },
  ): Promise<void> {
    const unrecorded = await this.db
      .select({
        amountPerPoint: EARN_AMOUNT_PER_POINT,
        discount: order.discount,
        orderId: order.id,
        organizationId: order.sellerId,
        paymentDate: order.paymentDate,
        subtotal: EARN_SUBTOTAL,
        userId: order.userId,
      })
      .from(order)
      .leftJoin(pointSetting, eq(pointSetting.id, POINT_SETTING_ID))
      .leftJoin(orderItem, eq(orderItem.orderId, order.id))
      .leftJoin(
        pointTransaction,
        and(
          eq(pointTransaction.orderId, order.id),
          eq(pointTransaction.type, 'earn'),
        ),
      )
      .where(
        and(
          'userId' in scope
            ? eq(order.userId, scope.userId)
            : and(
                eq(order.sellerId, scope.organizationId),
                isNotNull(order.userId),
              ),
          isNotNull(order.paymentDate),
          notInArray(order.orderStatus, [...ORDER_TERMINAL_STATUSES]),
          sql`${EARN_AMOUNT_PER_POINT} > 0`,
          isNull(pointTransaction.id),
        ),
      )
      .groupBy(order.id, pointSetting.id);

    const earns = unrecorded.flatMap((row) => {
      const points = earnedPoints(
        row.subtotal,
        row.discount,
        row.amountPerPoint,
      );
      if (points <= 0) return [];

      return [
        {
          id: randomUUID(),
          expiresAt: toExpiresAt(row.paymentDate!),
          orderId: row.orderId,
          organizationId: row.organizationId,
          points,
          remainingPoints: points,
          type: 'earn' as const,
          userId: row.userId!,
        },
      ];
    });
    if (earns.length > 0) {
      await this.db
        .insert(pointTransaction)
        .values(earns)
        .onConflictDoNothing();
      for (const userId of new Set(earns.map((earn) => earn.userId)))
        await this.db.transaction((tx) => this.settleDebts(tx, userId));
    }

    const revoked = alias(pointTransaction, 'revoked');

    const revocable = await this.db
      .select({
        id: pointTransaction.id,
        orderId: order.id,
        orderStatus: order.orderStatus,
        points: pointTransaction.points,
        remainingPoints: pointTransaction.remainingPoints,
      })
      .from(pointTransaction)
      .innerJoin(order, eq(pointTransaction.orderId, order.id))
      .leftJoin(
        revoked,
        and(eq(revoked.orderId, order.id), eq(revoked.type, 'revoke')),
      )
      .where(
        and(
          'userId' in scope
            ? eq(pointTransaction.userId, scope.userId)
            : eq(pointTransaction.organizationId, scope.organizationId),
          eq(pointTransaction.type, 'earn'),
          gte(pointTransaction.remainingPoints, 0),
          isNull(revoked.id),
          or(
            inArray(order.orderStatus, [...ORDER_TERMINAL_STATUSES]),
            isNull(order.paymentDate),
          ),
        ),
      );
    if (revocable.length === 0) return;

    const removableIds = revocable
      .filter((r) => r.remainingPoints === r.points)
      .map((r) => r.id);
    const drainableOrderIds = revocable
      .filter(
        (r) =>
          r.remainingPoints !== r.points &&
          ORDER_TERMINAL_STATUSES.some((status) => status === r.orderStatus),
      )
      .map((r) => r.orderId);

    if (removableIds.length > 0)
      await this.db
        .delete(pointTransaction)
        .where(
          and(
            inArray(pointTransaction.id, removableIds),
            eq(pointTransaction.remainingPoints, pointTransaction.points),
          ),
        );
    for (const orderId of drainableOrderIds)
      await this.db.transaction((tx) =>
        this.revokeForOrder(tx, {
          orderBecomesTerminal: true,
          orderId,
          ratio: 1,
        }),
      );
  }

  private lockPoints(
    tx: Pick<DrizzleDB, 'select'>,
    userId: string,
    orderId?: string,
  ) {
    return tx
      .select({
        id: pointTransaction.id,
        createdAt: pointTransaction.createdAt,
        expiresAt: pointTransaction.expiresAt,
        orderId: pointTransaction.orderId,
        organizationId: pointTransaction.organizationId,
        points: pointTransaction.points,
        remainingPoints: pointTransaction.remainingPoints,
        type: pointTransaction.type,
      })
      .from(pointTransaction)
      .where(
        and(
          eq(pointTransaction.userId, userId),
          or(
            and(this.notExpired(), ne(pointTransaction.remainingPoints, 0)),
            orderId ? eq(pointTransaction.orderId, orderId) : undefined,
          ),
        ),
      )
      .orderBy(...LOT_CONSUMPTION_ORDER)
      .for('update');
  }

  private async settleDebts(
    tx: Pick<DrizzleDB, 'insert' | 'select' | 'update'>,
    userId: string,
  ): Promise<void> {
    const rows = await this.lockPoints(tx, userId);

    const lots = rows.filter((row) => row.remainingPoints > 0);
    const debts = [];
    for (const row of rows.filter((row) => row.remainingPoints < 0))
      debts.push(
        row.type === 'earn'
          ? {
              ...row,
              id: await this.separateLegacyDebt(tx, { ...row, userId }),
            }
          : row,
      );
    debts.sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    const settled = new Map<string, number>();
    for (const debt of debts)
      for (const lot of lots) {
        if (debt.remainingPoints === 0) break;
        if (lot.remainingPoints <= 0) continue;
        const consumed = Math.min(lot.remainingPoints, -debt.remainingPoints);
        lot.remainingPoints -= consumed;
        debt.remainingPoints += consumed;
        settled.set(lot.id, lot.remainingPoints);
        settled.set(debt.id, debt.remainingPoints);
      }

    for (const [id, remainingPoints] of settled)
      await tx
        .update(pointTransaction)
        .set({ remainingPoints, updatedAt: new Date() })
        .where(eq(pointTransaction.id, id));
  }

  private async separateLegacyDebt(
    tx: Pick<DrizzleDB, 'insert' | 'select' | 'update'>,
    earn: Pick<
      PointTransaction,
      | 'id'
      | 'expiresAt'
      | 'orderId'
      | 'organizationId'
      | 'points'
      | 'remainingPoints'
      | 'userId'
    >,
  ): Promise<string> {
    if (!earn.orderId || (await this.revokedForOrder(tx, earn.orderId)) > 0)
      return earn.id;

    const id = randomUUID();
    await tx.insert(pointTransaction).values({
      id,
      expiresAt: earn.expiresAt,
      orderId: earn.orderId,
      organizationId: earn.organizationId,
      points: -earn.points,
      remainingPoints: earn.remainingPoints,
      type: 'revoke',
      userId: earn.userId,
    });
    await tx
      .update(pointTransaction)
      .set({ remainingPoints: 0, updatedAt: new Date() })
      .where(eq(pointTransaction.id, earn.id));

    return id;
  }

  async revokeForOrder(
    tx: Pick<DrizzleDB, 'delete' | 'insert' | 'select' | 'update'>,
    {
      orderBecomesTerminal,
      orderId,
      ratio,
    }: { orderBecomesTerminal: boolean; orderId: string; ratio: number },
  ): Promise<void> {
    const [buyer] = await tx
      .select({ userId: order.userId })
      .from(order)
      .where(eq(order.id, orderId));
    if (buyer?.userId) await this.lockPoints(tx, buyer.userId, orderId);

    const [earned] = await tx
      .select({
        id: pointTransaction.id,
        expiresAt: pointTransaction.expiresAt,
        organizationId: pointTransaction.organizationId,
        points: pointTransaction.points,
        remainingPoints: pointTransaction.remainingPoints,
        userId: pointTransaction.userId,
      })
      .from(pointTransaction)
      .where(
        and(
          eq(pointTransaction.orderId, orderId),
          eq(pointTransaction.type, 'earn'),
        ),
      )
      .for('update');

    if (!earned) {
      if (orderBecomesTerminal) {
        await tx
          .delete(pointTransaction)
          .where(
            and(
              eq(pointTransaction.orderId, orderId),
              eq(pointTransaction.type, 'revoke'),
            ),
          );

        return;
      }

      const pending = await this.calculatePendingEarn(tx, orderId);
      if (!pending || pending.points <= 0) return;

      const revoking = Math.min(
        Math.round(pending.points * ratio),
        pending.points - (await this.revokedForOrder(tx, orderId)),
      );
      if (revoking <= 0) return;

      await tx.insert(pointTransaction).values({
        id: randomUUID(),
        expiresAt: pending.expiresAt,
        orderId,
        organizationId: pending.organizationId,
        points: -revoking,
        remainingPoints: -revoking,
        type: 'revoke',
        userId: pending.userId,
      });
      await this.settleDebts(tx, pending.userId);

      return;
    }

    if (earned.remainingPoints < 0)
      await this.separateLegacyDebt(tx, { ...earned, orderId });

    const unrevoked = earned.points - (await this.revokedForOrder(tx, orderId));
    const revoking = orderBecomesTerminal
      ? unrevoked
      : Math.min(Math.round(earned.points * ratio), unrevoked);
    if (revoking <= 0) return;

    const deductible = Math.max(earned.remainingPoints, 0);
    const deducted = Math.min(deductible, revoking);

    if (deducted > 0)
      await tx
        .update(pointTransaction)
        .set({
          remainingPoints: earned.remainingPoints - deducted,
          updatedAt: new Date(),
        })
        .where(eq(pointTransaction.id, earned.id));

    await tx.insert(pointTransaction).values({
      id: randomUUID(),
      expiresAt: earned.expiresAt,
      orderId,
      organizationId: earned.organizationId,
      points: -revoking,
      // 已被兌換掉而收不回來的部分掛在這裡，餘額因此可能為負
      remainingPoints: -(revoking - deducted),
      type: 'revoke',
      userId: earned.userId,
    });
    if (deducted < revoking) await this.settleDebts(tx, earned.userId);
  }

  private async revokedForOrder(
    tx: Pick<DrizzleDB, 'select'>,
    orderId: string,
  ): Promise<number> {
    const [{ revoked }] = await tx
      .select({
        revoked:
          sql<number>`-COALESCE(SUM(${pointTransaction.points}), 0)`.mapWith(
            Number,
          ),
      })
      .from(pointTransaction)
      .where(
        and(
          eq(pointTransaction.orderId, orderId),
          eq(pointTransaction.type, 'revoke'),
        ),
      );

    return revoked;
  }

  /** 尚未 lazy 入點的訂單，依付款當下的快照算出它應得多少點 */
  private async calculatePendingEarn(
    tx: Pick<DrizzleDB, 'select'>,
    orderId: string,
  ): Promise<{
    expiresAt: Date | null;
    organizationId: string;
    points: number;
    userId: string;
  } | null> {
    const [found] = await tx
      .select({
        amountPerPoint: EARN_AMOUNT_PER_POINT,
        discount: order.discount,
        organizationId: order.sellerId,
        paymentDate: order.paymentDate,
        subtotal: EARN_SUBTOTAL,
        userId: order.userId,
      })
      .from(order)
      .leftJoin(pointSetting, eq(pointSetting.id, POINT_SETTING_ID))
      .leftJoin(orderItem, eq(orderItem.orderId, order.id))
      .where(eq(order.id, orderId))
      .groupBy(order.id, pointSetting.id);

    if (!found?.userId) return null;

    if (!Number(found.amountPerPoint)) return null;

    return {
      expiresAt: found.paymentDate ? toExpiresAt(found.paymentDate) : null,
      organizationId: found.organizationId,
      points: earnedPoints(
        found.subtotal,
        found.discount,
        found.amountPerPoint,
      ),
      userId: found.userId,
    };
  }

  async expectedPoints(orderIds: string[]): Promise<Map<string, number>> {
    if (orderIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        amountPerPoint: EXPECTED_AMOUNT_PER_POINT,
        discount: order.discount,
        orderId: order.id,
        subtotal: EARN_SUBTOTAL,
      })
      .from(order)
      .leftJoin(pointSetting, eq(pointSetting.id, POINT_SETTING_ID))
      .leftJoin(orderItem, eq(orderItem.orderId, order.id))
      .where(
        and(
          inArray(order.id, orderIds),
          isNotNull(order.userId),
          notInArray(order.orderStatus, [...ORDER_TERMINAL_STATUSES]),
        ),
      )
      .groupBy(order.id, pointSetting.id);

    return new Map(
      rows.flatMap((row) => {
        const points = expectedPointsFor(
          row.subtotal,
          row.discount,
          row.amountPerPoint,
        );

        return points === null ? [] : [[row.orderId, points] as const];
      }),
    );
  }

  async estimatePoints(
    subtotal: number,
    discount: number,
  ): Promise<number | null> {
    const setting = await this.db.query.pointSetting.findFirst();

    return expectedPointsFor(
      subtotal.toFixed(2),
      discount.toFixed(2),
      setting?.amountPerPoint ?? null,
    );
  }

  private notExpired() {
    return or(
      isNull(pointTransaction.expiresAt),
      gt(pointTransaction.expiresAt, new Date()),
      lt(pointTransaction.remainingPoints, 0),
    );
  }

  private balance() {
    return sql<number>`COALESCE(SUM(${pointTransaction.remainingPoints}) FILTER (WHERE ${this.notExpired()}), 0)`.mapWith(
      Number,
    );
  }

  private expiringLots(userIds: string[]) {
    return this.db
      .select({
        id: pointTransaction.id,
        expiresAt: sql<Date>`${pointTransaction.expiresAt}`.mapWith(
          pointTransaction.expiresAt,
        ),
        remainingPoints: pointTransaction.remainingPoints,
        userId: pointTransaction.userId,
      })
      .from(pointTransaction)
      .where(
        and(
          inArray(pointTransaction.userId, userIds),
          gt(pointTransaction.remainingPoints, 0),
          this.notExpired(),
          lt(
            pointTransaction.expiresAt,
            new Date(
              platformMidnight(Date.now()) + (EXPIRING_SOON_DAYS + 1) * DAY_MS,
            ),
          ),
        ),
      )
      .orderBy(asc(pointTransaction.expiresAt));
  }

  async findAllForOrganization(
    organizationSlug: string,
    query: OrganizationPointTransactionQueryDto = {},
  ): Promise<OrganizationPointTransactionListResponseDto> {
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

    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    await this.syncEarned({ organizationId });

    const fieldMap: Record<string, Column | SQL> = {
      userEmail: user.email,
      userName: user.name,
      orderNumber: order.orderNumber,
      type: sql`${pointTransaction.type}::text`,
      points: pointTransaction.points,
      remainingPoints: pointTransaction.remainingPoints,
      createdAt: pointTransaction.createdAt,
      expiresAt: pointTransaction.expiresAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = [
      ...(sortBy ? [dir(fieldMap[sortBy])] : []),
      desc(pointTransaction.createdAt),
      desc(pointTransaction.id),
    ];

    const where = and(
      eq(pointTransaction.organizationId, organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            POINT_TRANSACTION_STRING_FILTER_FIELDS,
            POINT_TRANSACTION_DATE_FILTER_FIELDS,
            POINT_TRANSACTION_ENUM_FILTER_FIELDS,
            POINT_TRANSACTION_NUMBER_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: POINT_TRANSACTION_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(user.email, `%${escapeLike(value)}%`),
          ilike(user.name, `%${escapeLike(value)}%`),
          ilike(order.orderNumber, `%${escapeLike(value)}%`),
          ilike(
            localTimeText(pointTransaction.createdAt),
            `%${escapeLike(value)}%`,
          ),
        ],
      }),
    );

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: pointTransaction.id,
          createdAt: pointTransaction.createdAt,
          expiresAt: pointTransaction.expiresAt,
          orderId: pointTransaction.orderId,
          note: pointTransaction.note,
          orderNumber: order.orderNumber,
          points: pointTransaction.points,
          remainingPoints: pointTransaction.remainingPoints,
          type: pointTransaction.type,
          userEmail: user.email,
          userName: user.name,
        })
        .from(pointTransaction)
        .innerJoin(user, eq(pointTransaction.userId, user.id))
        .leftJoin(order, eq(pointTransaction.orderId, order.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(pointTransaction)
        .innerJoin(user, eq(pointTransaction.userId, user.id))
        .leftJoin(order, eq(pointTransaction.orderId, order.id))
        .where(where),
    ]);

    return { data, total };
  }

  private async isCustomerOf(
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const [paidOrder] = await this.db
      .select({ id: order.id })
      .from(order)
      .where(
        and(
          eq(order.sellerId, organizationId),
          eq(order.userId, userId),
          isNotNull(order.paymentDate),
        ),
      )
      .limit(1);
    if (paidOrder) return true;
    const [transaction] = await this.db
      .select({ id: pointTransaction.id })
      .from(pointTransaction)
      .where(
        and(
          eq(pointTransaction.organizationId, organizationId),
          eq(pointTransaction.userId, userId),
        ),
      )
      .limit(1);
    return !!transaction;
  }

  async getAdjustmentLimit(
    memberRole: string,
  ): Promise<PointAdjustmentLimitDto> {
    const setting = await this.db.query.pointSetting.findFirst();
    return {
      enabled: !!setting?.pointsEnabledAt,
      ownerOnlyAbovePoints: isOwnerRole(memberRole)
        ? null
        : maxNonOwnerAdjustPoints(setting?.amountPerPoint),
    };
  }

  async adjustForOrganization(
    organizationSlug: string,
    { email, note, points }: AdjustPointsDto,
    adjustedBy: string,
    adjusterRole: string,
  ): Promise<OrganizationPointTransactionDto> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );
    const setting = await this.db.query.pointSetting.findFirst();
    if (!setting?.pointsEnabledAt)
      throw new BadRequestException(this.t('notEnabled'));
    const { amountPerPoint } = setting;

    const maxNonOwnerPoints = maxNonOwnerAdjustPoints(amountPerPoint);
    if (Math.abs(points) > maxNonOwnerPoints && !isOwnerRole(adjusterRole))
      throw new ForbiddenException(
        this.t('adjustOwnerOnly', { maxPoints: maxNonOwnerPoints }),
      );

    const target = await this.db.query.user.findFirst({
      where: sql`lower(${user.email}) = lower(${email.trim()})`,
    });
    if (!target) throw new NotFoundException(this.tCoupons('memberNotFound'));
    if (target.id === adjustedBy)
      throw new BadRequestException(this.t('adjustSelf'));
    if (!(await this.isCustomerOf(organizationId, target.id)))
      throw new NotFoundException(this.tCoupons('memberNotFound'));

    await this.syncEarned({ userId: target.id });

    const created = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`points_adjust:${organizationId}:${target.id}`}, 0))`,
      );
      if (!isOwnerRole(adjusterRole)) {
        const [{ adjustedToday }] = await tx
          .select({
            adjustedToday: sql<number>`COALESCE(SUM(ABS(${pointTransaction.points})), 0)::int`,
          })
          .from(pointTransaction)
          .where(
            and(
              eq(pointTransaction.organizationId, organizationId),
              eq(pointTransaction.userId, target.id),
              eq(pointTransaction.type, 'adjust'),
              gte(
                pointTransaction.createdAt,
                new Date(platformMidnight(Date.now())),
              ),
            ),
          );
        if (adjustedToday + Math.abs(points) > maxNonOwnerPoints)
          throw new ForbiddenException(
            this.t('adjustOwnerOnly', { maxPoints: maxNonOwnerPoints }),
          );
      }

      if (points < 0) {
        const holdings = await tx
          .select({
            id: pointTransaction.id,
            remainingPoints: pointTransaction.remainingPoints,
          })
          .from(pointTransaction)
          .where(
            and(
              eq(pointTransaction.userId, target.id),
              eq(pointTransaction.organizationId, organizationId),
              inArray(pointTransaction.type, ['earn', 'revoke', 'adjust']),
              this.notExpired(),
            ),
          )
          .orderBy(
            asc(pointTransaction.expiresAt),
            asc(pointTransaction.createdAt),
          )
          .for('update');

        const balance = holdings.reduce(
          (sum, row) => sum + row.remainingPoints,
          0,
        );
        if (balance < -points)
          throw new BadRequestException(this.t('insufficient'));

        let deficit = -points;
        for (const holding of holdings) {
          if (deficit === 0) break;
          if (holding.remainingPoints <= 0) continue;
          const consumed = Math.min(holding.remainingPoints, deficit);
          await tx
            .update(pointTransaction)
            .set({
              remainingPoints: holding.remainingPoints - consumed,
              updatedAt: new Date(),
            })
            .where(eq(pointTransaction.id, holding.id));
          deficit -= consumed;
        }
      }

      const [row] = await tx
        .insert(pointTransaction)
        .values({
          id: randomUUID(),
          adjustedBy,
          createdAt: new Date(),
          expiresAt: points > 0 ? toExpiresAt(new Date()) : null,
          note: note.trim(),
          organizationId,
          points,
          remainingPoints: Math.max(points, 0),
          type: 'adjust',
          userId: target.id,
        })
        .returning();
      if (points > 0) await this.settleDebts(tx, target.id);

      return row;
    });

    return {
      id: created.id,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
      note: created.note,
      orderId: null,
      orderNumber: null,
      points: created.points,
      remainingPoints: created.remainingPoints,
      type: created.type,
      userEmail: target.email,
      userName: target.name,
    };
  }

  async getAllMine(
    userId: string,
    query: PointsPaginationQueryDto = {},
  ): Promise<MyPointsDto> {
    const { limit = 10, offset = 0 } = query;

    await this.syncEarned({ userId });

    const [transactions, [{ balance, transactionsTotal }], expiringLots] =
      await Promise.all([
        this.db
          .select({
            confirmationNumber: order.confirmationNumber,
            couponCode: coupon.code,
            orderNumber: order.orderNumber,
            organizationName: organization.name,
            transaction: pointTransaction,
          })
          .from(pointTransaction)
          .leftJoin(
            organization,
            eq(pointTransaction.organizationId, organization.id),
          )
          .leftJoin(order, eq(pointTransaction.orderId, order.id))
          .leftJoin(
            userCoupon,
            eq(pointTransaction.userCouponId, userCoupon.id),
          )
          .leftJoin(coupon, eq(userCoupon.couponId, coupon.id))
          .where(eq(pointTransaction.userId, userId))
          .orderBy(desc(pointTransaction.createdAt), desc(pointTransaction.id))
          .limit(limit)
          .offset(offset),
        this.db
          .select({
            balance: this.balance(),
            transactionsTotal: count(),
          })
          .from(pointTransaction)
          .where(eq(pointTransaction.userId, userId)),
        this.expiringLots([userId]),
      ]);

    const redeemables = await this.db.query.coupon.findMany({
      where: and(
        eq(coupon.isActive, true),
        isNotNull(coupon.pointsCost),
        withinCapacity(),
        withinValidity(),
      ),
      orderBy: [asc(coupon.pointsCost)],
    });

    const applicableIds = [
      ...new Set(redeemables.flatMap((c) => c.applicableOrganizationIds || [])),
    ];
    const applicableOrgs = applicableIds.length
      ? await this.db
          .select({ id: organization.id, name: organization.name })
          .from(organization)
          .where(inArray(organization.id, applicableIds))
          .orderBy(asc(organization.createdAt))
      : [];
    const names = new Map(applicableOrgs.map((row) => [row.id, row.name]));
    const orderedOrgIds = [...names.keys()];

    return {
      balance,
      expiringSoon: expiringByPlatformDay(expiringLots, balance),
      redeemableCoupons: redeemables.map((c) => ({
        ...toPointsCoupon(c),
        applicableOrganizationNames: c.applicableOrganizationIds
          ? orderedOrgIds
              .filter((id) => c.applicableOrganizationIds?.includes(id))
              .map((id) => names.get(id) || '')
          : null,
      })),
      transactions: transactions.map(
        ({
          confirmationNumber,
          couponCode,
          orderNumber,
          organizationName,
          transaction,
        }) => ({
          id: transaction.id,
          confirmationNumber,
          couponCode,
          createdAt: transaction.createdAt,
          expiresAt: transaction.expiresAt,
          orderNumber,
          organizationName,
          points: transaction.points,
          type: transaction.type,
        }),
      ),
      transactionsTotal,
    };
  }

  async notifyExpiringPoints(): Promise<number> {
    const organizations = await this.db
      .select({ id: organization.id })
      .from(organization);
    for (const { id } of organizations)
      await this.syncEarned({ organizationId: id }).catch((error: unknown) =>
        this.logger.error(error),
      );

    const today = platformMidnight(Date.now());
    const due = await this.db
      .select({
        expiresAt: sql<Date>`${pointTransaction.expiresAt}`.mapWith(
          pointTransaction.expiresAt,
        ),
        userId: pointTransaction.userId,
      })
      .from(pointTransaction)
      .where(
        and(
          gt(pointTransaction.remainingPoints, 0),
          isNull(pointTransaction.expiryRemindedAt),
          gte(
            pointTransaction.expiresAt,
            new Date(today + EXPIRY_REMINDER_FIRST_DAY * DAY_MS),
          ),
          lt(
            pointTransaction.expiresAt,
            new Date(today + (EXPIRING_SOON_DAYS + 1) * DAY_MS),
          ),
        ),
      );
    if (!due.length) return 0;

    const dueDays = new Set(
      due.map(
        ({ expiresAt, userId }) =>
          `${userId}:${platformDayNumber(expiresAt.getTime())}`,
      ),
    );
    const userIds = [...new Set(due.map(({ userId }) => userId))];
    const [lots, balances] = await Promise.all([
      this.expiringLots(userIds),
      this.db
        .select({ userId: pointTransaction.userId, balance: this.balance() })
        .from(pointTransaction)
        .where(inArray(pointTransaction.userId, userIds))
        .groupBy(pointTransaction.userId),
    ]);

    let notified = 0;
    for (const { userId, balance } of balances) {
      const userLots = lots.filter((lot) => lot.userId === userId);
      for (const { expiresAt, points } of expiringByPlatformDay(
        userLots,
        balance,
      )) {
        const day = platformDayNumber(expiresAt.getTime());
        if (!dueDays.has(`${userId}:${day}`)) continue;

        const lotIds = userLots
          .filter((lot) => platformDayNumber(lot.expiresAt.getTime()) === day)
          .map(({ id }) => id);
        try {
          await this.db.transaction(async (tx) => {
            const marked = await tx
              .update(pointTransaction)
              .set({ expiryRemindedAt: new Date() })
              .where(
                and(
                  inArray(pointTransaction.id, lotIds),
                  isNull(pointTransaction.expiryRemindedAt),
                ),
              )
              .returning({ id: pointTransaction.id });
            if (!marked.length) return;
            const sent = await this.mails.sendPointsExpiryReminder({
              userId,
              expiresAt,
              points,
            });
            if (sent) notified += 1;
          });
        } catch (error) {
          this.logger.error(error);
        }
      }
    }
    return notified;
  }

  async redeem(
    userId: string,
    couponId: string,
  ): Promise<UserCouponResponseDto> {
    await this.syncEarned({ userId });

    const found = await this.db.query.coupon.findFirst({
      where: and(
        eq(coupon.id, couponId),
        eq(coupon.isActive, true),
        isNotNull(coupon.pointsCost),
        withinValidity(),
      ),
    });
    if (!found?.pointsCost)
      throw new BadRequestException(this.t('notRedeemable'));
    const pointsCost = found.pointsCost;

    const created = await this.db.transaction(async (tx) => {
      if (found.totalLimit !== null) {
        const [locked] = await tx
          .select({ usedCount: coupon.usedCount })
          .from(coupon)
          .where(eq(coupon.id, found.id))
          .for('update');

        const [{ value: reserved }] = await tx
          .select({ value: count() })
          .from(userCoupon)
          .where(
            and(eq(userCoupon.couponId, found.id), isNull(userCoupon.usedAt)),
          );
        if (locked.usedCount + reserved >= found.totalLimit)
          throw new BadRequestException(this.tCoupons('usedUp'));
      }

      const earns = await tx
        .select({
          id: pointTransaction.id,
          remainingPoints: pointTransaction.remainingPoints,
        })
        .from(pointTransaction)
        .where(
          and(
            eq(pointTransaction.userId, userId),
            inArray(pointTransaction.type, ['earn', 'revoke', 'adjust']),
            this.notExpired(),
          ),
        )
        .orderBy(...LOT_CONSUMPTION_ORDER)
        .for('update');

      // 每人上限要在鎖住點數列之後才數，這把鎖同時讓同一會員的兌換排隊
      if (found.perUserLimit !== null) {
        const [{ value: redeemed }] = await tx
          .select({ value: count() })
          .from(userCoupon)
          .where(
            and(
              eq(userCoupon.couponId, found.id),
              eq(userCoupon.userId, userId),
              eq(userCoupon.source, 'redeemed'),
            ),
          );
        if (redeemed >= found.perUserLimit)
          throw new BadRequestException(this.t('perUserLimitReached'));
      }

      const balance = earns.reduce((sum, e) => sum + e.remainingPoints, 0);
      if (balance < pointsCost)
        throw new BadRequestException(this.t('insufficient'));

      let deficit = pointsCost;
      for (const earn of earns) {
        if (deficit === 0) break;
        if (earn.remainingPoints <= 0) continue;
        const consumed = Math.min(earn.remainingPoints, deficit);
        await tx
          .update(pointTransaction)
          .set({
            remainingPoints: earn.remainingPoints - consumed,
            updatedAt: new Date(),
          })
          .where(eq(pointTransaction.id, earn.id));
        deficit -= consumed;
      }

      const [voucher] = await tx
        .insert(userCoupon)
        .values({
          id: randomUUID(),
          couponId: found.id,
          source: 'redeemed',
          userId,
        })
        .returning();

      await tx.insert(pointTransaction).values({
        id: randomUUID(),
        points: -pointsCost,
        type: 'redeem',
        userCouponId: voucher.id,
        userId,
      });

      return voucher;
    });

    return {
      id: created.id,
      coupon: {
        id: found.id,
        code: found.code,
        discountCurrency: found.discountCurrency,
        discountType: found.discountType,
        discountValue: found.discountValue,
        isActive: found.isActive,
        minSubtotal: found.minSubtotal,
        scope: found.scope,
        validFrom: found.validFrom,
        validThrough: found.validThrough,
      },
      source: created.source,
      usedAt: created.usedAt,
      createdAt: created.createdAt,
    };
  }
}
