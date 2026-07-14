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
  lt,
  lte,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { coupon, userCoupon, type Coupon } from 'src/db/schema/coupons';
import { order, orderItem } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import { pointTransaction } from 'src/db/schema/points';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import type { I18nTranslations } from 'src/generated/i18n.generated';

import type { UserCouponResponseDto } from '../coupons/dto/coupon-response.dto';

import type {
  MyPointsWalletDto,
  PointsCouponDto,
} from './dto/points-response.dto';

const toPointsCoupon = (found: Coupon): PointsCouponDto => ({
  id: found.id,
  code: found.code,
  discountCurrency: found.discountCurrency,
  discountType: found.discountType,
  discountValue: found.discountValue,
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

  private t(key: 'insufficient' | 'notRedeemable'): string {
    return this.i18n.t(`common.points.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  // Lazy 入點：已付款且未取消的訂單補入 earn；已取消訂單的未用點數收回
  private async syncEarned(userId: string): Promise<void> {
    const unrecorded = await this.db
      .select({
        amountPerPoint: organization.amountPerPoint,
        discount: order.discount,
        orderId: order.id,
        organizationId: order.sellerId,
        paymentDate: order.paymentDate,
        pointsValidityYears: organization.pointsValidityYears,
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
          notInArray(order.orderStatus, ['OrderCancelled', 'OrderProblem']),
          isNotNull(organization.amountPerPoint),
          isNull(pointTransaction.id),
        ),
      )
      .groupBy(order.id, organization.id, pointTransaction.id);

    const earns = unrecorded.flatMap((row) => {
      const total = Number(row.subtotal) - Number(row.discount || 0);
      const points = Math.floor(total / Number(row.amountPerPoint));
      if (points <= 0) return [];

      const paymentDate = row.paymentDate || new Date();
      const expiresAt = row.pointsValidityYears
        ? new Date(
            new Date(paymentDate).setFullYear(
              paymentDate.getFullYear() + row.pointsValidityYears,
            ),
          )
        : null;

      return [
        {
          id: randomUUID(),
          expiresAt,
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
      await this.db.insert(pointTransaction).values(earns).onConflictDoNothing();

    // 訂單事後取消／付款失敗：未動用的 earn 直接移除，已部分動用的清空餘點
    const revocable = await this.db
      .select({
        id: pointTransaction.id,
        points: pointTransaction.points,
        remainingPoints: pointTransaction.remainingPoints,
      })
      .from(pointTransaction)
      .innerJoin(order, eq(pointTransaction.orderId, order.id))
      .where(
        and(
          eq(pointTransaction.userId, userId),
          eq(pointTransaction.type, 'earn'),
          gt(pointTransaction.remainingPoints, 0),
          inArray(order.orderStatus, ['OrderCancelled', 'OrderProblem']),
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
        .where(inArray(pointTransaction.id, removableIds));
    if (drainableIds.length > 0)
      await this.db
        .update(pointTransaction)
        .set({ remainingPoints: 0, updatedAt: new Date() })
        .where(inArray(pointTransaction.id, drainableIds));
  }

  private withinValidity() {
    const now = new Date();
    return and(
      or(isNull(coupon.validFrom), lte(coupon.validFrom, now)),
      or(isNull(coupon.validThrough), gte(coupon.validThrough, now)),
    );
  }

  private notExpired() {
    return or(
      isNull(pointTransaction.expiresAt),
      gt(pointTransaction.expiresAt, new Date()),
    );
  }

  async getAllMine(userId: string): Promise<MyPointsWalletDto[]> {
    await this.syncEarned(userId);

    const transactions = await this.db
      .select({
        organizationName: organization.name,
        organizationSlug: organization.slug,
        transaction: pointTransaction,
      })
      .from(pointTransaction)
      .innerJoin(
        organization,
        eq(pointTransaction.organizationId, organization.id),
      )
      .where(eq(pointTransaction.userId, userId))
      .orderBy(desc(pointTransaction.createdAt));
    if (transactions.length === 0) return [];

    const organizationIds = [
      ...new Set(transactions.map((t) => t.transaction.organizationId)),
    ];
    const redeemables = await this.db.query.coupon.findMany({
      where: and(
        inArray(coupon.organizationId, organizationIds),
        eq(coupon.isActive, true),
        isNotNull(coupon.pointsCost),
        or(isNull(coupon.totalLimit), lt(coupon.usedCount, coupon.totalLimit)),
        this.withinValidity(),
      ),
      orderBy: [asc(coupon.pointsCost)],
    });

    const now = new Date();

    return organizationIds.map((organizationId) => {
      const mine = transactions.filter(
        (t) => t.transaction.organizationId === organizationId,
      );
      return {
        balance: mine.reduce(
          (sum, t) =>
            !t.transaction.expiresAt || t.transaction.expiresAt > now
              ? sum + t.transaction.remainingPoints
              : sum,
          0,
        ),
        organizationName: mine[0].organizationName,
        organizationSlug: mine[0].organizationSlug || '',
        redeemableCoupons: redeemables
          .filter((c) => c.organizationId === organizationId)
          .map(toPointsCoupon),
        transactions: mine.map(({ transaction }) => ({
          id: transaction.id,
          createdAt: transaction.createdAt,
          expiresAt: transaction.expiresAt,
          points: transaction.points,
          type: transaction.type,
        })),
      };
    });
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
        this.withinValidity(),
      ),
    });
    if (!found?.pointsCost)
      throw new BadRequestException(this.t('notRedeemable'));
    const pointsCost = found.pointsCost;

    const created = await this.db.transaction(async (tx) => {
      // 限量兌換：totalLimit 同時作為兌換上限；鎖券避免併發超發
      if (found.totalLimit !== null) {
        await tx
          .select({ id: coupon.id })
          .from(coupon)
          .where(eq(coupon.id, found.id))
          .for('update');

        const [{ value: redeemedCount }] = await tx
          .select({ value: count() })
          .from(userCoupon)
          .where(
            and(
              eq(userCoupon.couponId, found.id),
              eq(userCoupon.source, 'redeemed'),
            ),
          );
        if (redeemedCount >= found.totalLimit)
          throw new BadRequestException(this.t('notRedeemable'));
      }

      // FIFO 扣點：先到期者先扣；鎖定餘點避免併發重複扣
      const earns = await tx
        .select({
          id: pointTransaction.id,
          remainingPoints: pointTransaction.remainingPoints,
        })
        .from(pointTransaction)
        .where(
          and(
            eq(pointTransaction.userId, userId),
            eq(pointTransaction.organizationId, found.organizationId),
            eq(pointTransaction.type, 'earn'),
            gt(pointTransaction.remainingPoints, 0),
            this.notExpired(),
          ),
        )
        .orderBy(asc(pointTransaction.expiresAt), asc(pointTransaction.createdAt))
        .for('update');

      const balance = earns.reduce((sum, e) => sum + e.remainingPoints, 0);
      if (balance < pointsCost)
        throw new BadRequestException(this.t('insufficient'));

      let deficit = pointsCost;
      for (const earn of earns) {
        if (deficit === 0) break;
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
        organizationId: found.organizationId,
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
