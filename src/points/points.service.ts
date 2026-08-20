import { randomUUID } from 'crypto';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { coupon, userCoupon, type Coupon } from 'src/db/schema/coupons';
import {
  ORDER_TERMINAL_STATUSES,
  order,
  orderItem,
} from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import { pointTransaction } from 'src/db/schema/points';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import type { I18nTranslations } from 'src/generated/i18n.generated';

import { withinCapacity, withinValidity } from 'src/common/utils/coupons';

import type { UserCouponResponseDto } from '../coupons/dto/coupon-response.dto';

import type { PointsPaginationQueryDto } from './dto/points-pagination-query.dto';
import type { MyPointsDto, PointsCouponDto } from './dto/points-response.dto';

const toExpiresAt = (
  paymentDate: Date,
  validityYears: number | null,
): Date | null =>
  validityYears
    ? new Date(
        new Date(paymentDate).setFullYear(
          paymentDate.getFullYear() + validityYears,
        ),
      )
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
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  private t(
    key: 'insufficient' | 'notRedeemable' | 'perUserLimitReached',
  ): string {
    return this.i18n.t(`common.points.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  private tCoupons(key: 'usedUp'): string {
    return this.i18n.t(`common.coupons.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  // Lazy 入點：已付款且未取消的訂單補入 earn；已取消訂單的未用點數收回
  private async syncEarned(userId: string): Promise<void> {
    // 費率以付款當下的訂單快照為準；早於快照欄位的歷史訂單 fallback 組織現值
    const unrecorded = await this.db
      .select({
        amountPerPoint: sql<string>`COALESCE(${order.amountPerPoint}, ${organization.amountPerPoint})`,
        discount: order.discount,
        orderId: order.id,
        organizationId: order.sellerId,
        paymentDate: order.paymentDate,
        pointsValidityYears: sql<
          number | null
        >`COALESCE(${order.pointsValidityYears}, ${organization.pointsValidityYears})`,
        subtotal: sql<string>`COALESCE(SUM(${orderItem.unitPrice} * ${orderItem.orderQuantity}), 0)`,
      })
      .from(order)
      .innerJoin(organization, eq(order.sellerId, organization.id))
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
          eq(order.userId, userId),
          isNotNull(order.paymentDate),
          notInArray(order.orderStatus, [...ORDER_TERMINAL_STATUSES]),
          sql`COALESCE(${order.amountPerPoint}, ${organization.amountPerPoint}) > 0`,
          // 僅累計啟用點數之後付款的訂單，避免回溯補發整段歷史
          gte(order.paymentDate, organization.pointsEnabledAt),
          isNull(pointTransaction.id),
        ),
      )
      .groupBy(order.id, organization.id);

    const earns = unrecorded.flatMap((row) => {
      const total = Number(row.subtotal) - Number(row.discount || 0);
      const points = Math.floor(total / Number(row.amountPerPoint));
      if (points <= 0) return [];

      return [
        {
          id: randomUUID(),
          expiresAt: toExpiresAt(row.paymentDate!, row.pointsValidityYears),
          orderId: row.orderId,
          organizationId: row.organizationId,
          points,
          remainingPoints: points,
          type: 'earn' as const,
          userId,
        },
      ];
    });
    if (earns.length > 0)
      await this.db
        .insert(pointTransaction)
        .values(earns)
        .onConflictDoNothing();

    const revoked = alias(pointTransaction, 'revoked');

    const revocable = await this.db
      .select({
        id: pointTransaction.id,
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
          eq(pointTransaction.userId, userId),
          eq(pointTransaction.type, 'earn'),
          gt(pointTransaction.remainingPoints, 0),
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
    const drainableIds = revocable
      .filter((r) => r.remainingPoints !== r.points)
      .map((r) => r.id);

    if (removableIds.length > 0)
      await this.db
        .delete(pointTransaction)
        .where(
          and(
            inArray(pointTransaction.id, removableIds),
            eq(pointTransaction.remainingPoints, pointTransaction.points),
          ),
        );
    for (const id of drainableIds) {
      const target = revocable.find((r) => r.id === id)!;

      await this.db
        .update(pointTransaction)
        .set({
          remainingPoints: target.remainingPoints - target.points,
          updatedAt: new Date(),
        })
        .where(eq(pointTransaction.id, id));
    }
  }

  async revokeForOrder(
    tx: Pick<DrizzleDB, 'delete' | 'insert' | 'select' | 'update'>,
    {
      orderBecomesTerminal,
      orderId,
      ratio,
    }: { orderBecomesTerminal: boolean; orderId: string; ratio: number },
  ): Promise<void> {
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

      const revoking = Math.round(pending.points * ratio);
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

      return;
    }

    const revoking = Math.round(earned.points * ratio);
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
        amountPerPoint: sql<string>`COALESCE(${order.amountPerPoint}, ${organization.amountPerPoint})`,
        discount: order.discount,
        organizationId: order.sellerId,
        paymentDate: order.paymentDate,
        pointsValidityYears: sql<
          number | null
        >`COALESCE(${order.pointsValidityYears}, ${organization.pointsValidityYears})`,
        subtotal: sql<string>`COALESCE(SUM(${orderItem.unitPrice} * ${orderItem.orderQuantity}), 0)`,
        userId: order.userId,
      })
      .from(order)
      .innerJoin(organization, eq(order.sellerId, organization.id))
      .leftJoin(orderItem, eq(orderItem.orderId, order.id))
      .where(eq(order.id, orderId))
      .groupBy(order.id, organization.id);

    if (!found?.userId) return null;

    const amountPerPoint = Number(found.amountPerPoint);
    if (!amountPerPoint) return null;

    const total = Number(found.subtotal) - Number(found.discount || 0);

    return {
      expiresAt: found.paymentDate
        ? toExpiresAt(found.paymentDate, found.pointsValidityYears)
        : null,
      organizationId: found.organizationId,
      points: Math.floor(total / amountPerPoint),
      userId: found.userId,
    };
  }

  private notExpired() {
    return or(
      isNull(pointTransaction.expiresAt),
      gt(pointTransaction.expiresAt, new Date()),
    );
  }

  async getAllMine(
    userId: string,
    query: PointsPaginationQueryDto = {},
  ): Promise<MyPointsDto> {
    const { limit = 10, offset = 0 } = query;

    await this.syncEarned(userId);

    const transactions = await this.db
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
      .leftJoin(userCoupon, eq(pointTransaction.userCouponId, userCoupon.id))
      .leftJoin(coupon, eq(userCoupon.couponId, coupon.id))
      .where(eq(pointTransaction.userId, userId))
      .orderBy(desc(pointTransaction.createdAt));

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

    const now = new Date();

    return {
      balance: transactions.reduce(
        (sum, t) =>
          !t.transaction.expiresAt || t.transaction.expiresAt > now
            ? sum + t.transaction.remainingPoints
            : sum,
        0,
      ),
      redeemableCoupons: redeemables.map((c) => ({
        ...toPointsCoupon(c),
        applicableOrganizationNames: c.applicableOrganizationIds
          ? orderedOrgIds
              .filter((id) => c.applicableOrganizationIds?.includes(id))
              .map((id) => names.get(id) || '')
          : null,
      })),
      transactions: transactions
        .slice(offset, offset + limit)
        .map(
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
      transactionsTotal: transactions.length,
    };
  }

  async redeem(
    userId: string,
    couponId: string,
  ): Promise<UserCouponResponseDto> {
    await this.syncEarned(userId);

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

      const earns = await tx
        .select({
          id: pointTransaction.id,
          remainingPoints: pointTransaction.remainingPoints,
        })
        .from(pointTransaction)
        .where(
          and(
            eq(pointTransaction.userId, userId),
            inArray(pointTransaction.type, ['earn', 'revoke']),
            this.notExpired(),
          ),
        )
        .orderBy(
          asc(pointTransaction.expiresAt),
          asc(pointTransaction.createdAt),
        )
        .for('update');

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
