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
import { I18nContext, I18nService } from 'nestjs-i18n';
import { coupon, userCoupon, type Coupon } from 'src/db/schema/coupons';
import { order, orderItem } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import { pointTransaction } from 'src/db/schema/points';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import type { I18nTranslations } from 'src/generated/i18n.generated';

import { withinCapacity, withinValidity } from 'src/common/utils/coupons';

import type { UserCouponResponseDto } from '../coupons/dto/coupon-response.dto';

import type { PointsPaginationQueryDto } from './dto/points-pagination-query.dto';
import type { MyPointsDto, PointsCouponDto } from './dto/points-response.dto';

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
          notInArray(order.orderStatus, ['OrderCancelled', 'OrderProblem']),
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

      const paymentDate = row.paymentDate!;
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
      await this.db
        .insert(pointTransaction)
        .values(earns)
        .onConflictDoNothing();

    // 訂單事後取消／付款失敗：未動用的 earn 直接移除，已部分動用的清空餘點
    // 取捨：已用這筆點數兌換出的券不追回（目前沒有已付款訂單的取消流程）
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
      await this.db.delete(pointTransaction).where(
        and(
          inArray(pointTransaction.id, removableIds),
          // 重驗仍未動用：與併發兌換有 race；落空者下次 sync 走清空餘點路徑
          eq(pointTransaction.remainingPoints, pointTransaction.points),
        ),
      );
    if (drainableIds.length > 0)
      await this.db
        .update(pointTransaction)
        .set({ remainingPoints: 0, updatedAt: new Date() })
        .where(inArray(pointTransaction.id, drainableIds));
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

    // 限定店家的店名清單；null = 全部店家通用
    const applicableIds = [
      ...new Set(redeemables.flatMap((c) => c.applicableOrganizationIds || [])),
    ];
    const applicableOrgs = applicableIds.length
      ? await this.db
          .select({ id: organization.id, name: organization.name })
          .from(organization)
          .where(inArray(organization.id, applicableIds))
      : [];
    const names = new Map(applicableOrgs.map((row) => [row.id, row.name]));

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
        applicableOrganizationNames:
          c.applicableOrganizationIds?.map((id) => names.get(id) || '') || null,
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
      // 限量：totalLimit 扣除已使用與已發出未使用的券；鎖券避免併發超發
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

      // 每人限量：perUserLimit 同時作為兌換上限，避免囤券
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

      // FIFO 扣點：全店家合併餘額、先到期者先扣；鎖定餘點避免併發重複扣
      const earns = await tx
        .select({
          id: pointTransaction.id,
          remainingPoints: pointTransaction.remainingPoints,
        })
        .from(pointTransaction)
        .where(
          and(
            eq(pointTransaction.userId, userId),
            eq(pointTransaction.type, 'earn'),
            gt(pointTransaction.remainingPoints, 0),
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
