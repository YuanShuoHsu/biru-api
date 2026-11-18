import { Inject, Injectable } from '@nestjs/common';

import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  notInArray,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';
import { userCoupon } from '../db/schema/coupons.js';
import { ORDER_TERMINAL_STATUSES, order } from '../db/schema/orders.js';
import { organization } from '../db/schema/organizations.js';
import { pointAllocation, pointTransaction } from '../db/schema/points.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import { organizationNotFoundError } from '../common/utils/organizations.js';
import { utcTimestampParam } from '../common/utils/stats-buckets.js';

import { payrollPeriod } from '../payroll/payroll-calculation.js';

import type {
  PointReportCounterpartDto,
  PointReportDetailResponseDto,
  PointReportResponseDto,
  PointReportRowDto,
} from './dto/point-report.dto.js';
import { badRequestError } from './point-errors.js';
import { PointSettingsService } from './point-settings.service.js';

type Usage = { sourceId: string | null; consumerId: string; points: number };

const sumInt = (value: SQLWrapper) =>
  sql<number>`COALESCE(SUM(${value}), 0)::int`.mapWith(Number);

const sumIntWhere = (value: SQLWrapper, where: SQLWrapper) =>
  sql<number>`COALESCE(SUM(${value}) FILTER (WHERE ${where}), 0)::int`.mapWith(
    Number,
  );

const toAmount = (points: number, valuePerPoint: string) =>
  Math.round(points * Number(valuePerPoint) * 100) / 100;

@Injectable()
export class PointReportsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly pointSettingsService: PointSettingsService,
  ) {}

  private period(month: string) {
    const { start, end } = payrollPeriod(month);
    if (start.getTime() > Date.now())
      throw badRequestError('reportMonthNotStarted');
    const asOf = new Date(Math.min(end.getTime(), Date.now()));

    return {
      start: utcTimestampParam(start),
      end: utcTimestampParam(end),
      asOf: utcTimestampParam(asOf),
    };
  }

  private organizations() {
    return this.db
      .select({ id: organization.id, name: organization.name })
      .from(organization)
      .orderBy(asc(organization.name), asc(organization.id));
  }

  private async usage(month: string): Promise<Usage[]> {
    const { start, end } = this.period(month);

    return this.db
      .select({
        sourceId: pointAllocation.sourceOrganizationId,
        consumerId: order.sellerId,
        points: sumInt(pointAllocation.points),
      })
      .from(pointAllocation)
      .innerJoin(
        pointTransaction,
        eq(pointTransaction.id, pointAllocation.consumerTransactionId),
      )
      .innerJoin(userCoupon, eq(userCoupon.id, pointTransaction.userCouponId))
      .innerJoin(order, eq(order.id, userCoupon.orderId))
      .where(
        and(
          eq(pointAllocation.kind, 'redeem'),
          gte(userCoupon.usedAt, start),
          lt(userCoupon.usedAt, end),
          notInArray(order.orderStatus, [...ORDER_TERMINAL_STATUSES]),
        ),
      )
      .groupBy(pointAllocation.sourceOrganizationId, order.sellerId);
  }

  private async lots(month: string) {
    const { start, end, asOf } = this.period(month);
    // drizzle 在外層引用子查詢欄位時不加別名前綴，欄位別名不能和 join 進來的表的欄位同名
    const allocated = this.db
      .select({
        sourceTransactionId: pointAllocation.sourceTransactionId,
        total: sumInt(pointAllocation.points).as('allocated_points'),
        afterAsOf: sumIntWhere(
          pointAllocation.points,
          sql`${pointAllocation.createdAt} >= ${asOf}`,
        ).as('allocated_after_as_of'),
      })
      .from(pointAllocation)
      .groupBy(pointAllocation.sourceTransactionId)
      .as('allocated');
    const issuedAt = sql`COALESCE(${order.paymentDate}, ${pointTransaction.createdAt})`;
    const issuedInMonth = sql`${issuedAt} >= ${start} AND ${issuedAt} < ${end}`;

    return this.db
      .select({
        organizationId: pointTransaction.organizationId,
        earnedPoints: sumIntWhere(
          pointTransaction.points,
          sql`${pointTransaction.type} = 'earn' AND ${issuedInMonth}`,
        ),
        grantedPoints: sumIntWhere(
          pointTransaction.points,
          sql`${pointTransaction.type} = 'adjust' AND ${issuedInMonth}`,
        ),
        expiredPoints: sumIntWhere(
          pointTransaction.remainingPoints,
          sql`${pointTransaction.remainingPoints} > 0 AND ${pointTransaction.expiresAt} >= ${start} AND ${pointTransaction.expiresAt} <= ${asOf}`,
        ),
        outstandingPoints: sumIntWhere(
          sql`${pointTransaction.remainingPoints} + COALESCE(${allocated.afterAsOf}, 0)`,
          sql`${issuedAt} < ${asOf} AND (${pointTransaction.expiresAt} IS NULL OR ${pointTransaction.expiresAt} > ${asOf})`,
        ),
        unallocatedLegacyPoints: sumIntWhere(
          sql`${pointTransaction.points} - ${pointTransaction.remainingPoints} - COALESCE(${allocated.total}, 0)`,
          sql`${issuedAt} < ${asOf}`,
        ),
      })
      .from(pointTransaction)
      .leftJoin(order, eq(order.id, pointTransaction.orderId))
      .leftJoin(
        allocated,
        eq(allocated.sourceTransactionId, pointTransaction.id),
      )
      .where(
        and(
          inArray(pointTransaction.type, ['earn', 'adjust']),
          sql`${pointTransaction.points} > 0`,
        ),
      )
      .groupBy(pointTransaction.organizationId);
  }

  private async allocations(month: string) {
    const { start, end, asOf } = this.period(month);
    const createdInMonth = sql`${pointAllocation.createdAt} >= ${start} AND ${pointAllocation.createdAt} < ${end}`;
    const ofKind = (kind: string) =>
      sumIntWhere(
        pointAllocation.points,
        sql`${pointAllocation.kind} = ${kind} AND ${createdInMonth}`,
      );

    return this.db
      .select({
        organizationId: pointAllocation.sourceOrganizationId,
        redeemedPoints: ofKind('redeem'),
        revokedPoints: ofKind('revoke'),
        cancelledPoints: ofKind('cancel'),
        adjustedPoints: ofKind('adjust'),
        settledPoints: ofKind('settle'),
        unusedRedeemedPoints: sumIntWhere(
          pointAllocation.points,
          sql`${pointAllocation.kind} = 'redeem' AND ${pointAllocation.createdAt} < ${asOf} AND ${userCoupon.id} IS NOT NULL AND (${userCoupon.usedAt} IS NULL OR ${userCoupon.usedAt} >= ${asOf})`,
        ),
      })
      .from(pointAllocation)
      .leftJoin(
        pointTransaction,
        eq(pointTransaction.id, pointAllocation.consumerTransactionId),
      )
      .leftJoin(userCoupon, eq(userCoupon.id, pointTransaction.userCouponId))
      .groupBy(pointAllocation.sourceOrganizationId);
  }

  private async discounts(month: string) {
    const { start, end } = this.period(month);

    return this.db
      .select({
        organizationId: order.sellerId,
        discountAmount:
          sql<number>`COALESCE(SUM(${order.discount}), 0)`.mapWith(Number),
      })
      .from(userCoupon)
      .innerJoin(order, eq(order.id, userCoupon.orderId))
      .where(
        and(
          eq(userCoupon.source, 'redeemed'),
          gte(userCoupon.usedAt, start),
          lt(userCoupon.usedAt, end),
          isNotNull(order.discount),
          notInArray(order.orderStatus, [...ORDER_TERMINAL_STATUSES]),
        ),
      )
      .groupBy(order.sellerId);
  }

  async getReport(month: string): Promise<PointReportResponseDto> {
    const [setting, organizations, lots, allocations, usage, discounts] =
      await Promise.all([
        this.pointSettingsService.get(),
        this.organizations(),
        this.lots(month),
        this.allocations(month),
        this.usage(month),
        this.discounts(month),
      ]);
    const { accountingValuePerPoint } = setting;

    const rowOf = (
      organizationId: string | null,
      organizationName: string | null,
    ): PointReportRowDto => {
      const lot = lots.find((row) => row.organizationId === organizationId);
      const allocation = allocations.find(
        (row) => row.organizationId === organizationId,
      );
      const used = (match: (row: Usage) => boolean) =>
        usage.filter(match).reduce((sum, { points }) => sum + points, 0);
      const usedAtOwnStorePoints = used(
        (row) =>
          row.sourceId === organizationId && row.consumerId === organizationId,
      );
      const usedAtOtherStoresPoints = used(
        (row) =>
          row.sourceId === organizationId && row.consumerId !== organizationId,
      );
      const otherStoresUsedHerePoints = used(
        (row) =>
          row.consumerId === organizationId && row.sourceId !== organizationId,
      );
      const crossStoreNetPoints =
        usedAtOtherStoresPoints - otherStoresUsedHerePoints;
      const earnedPoints = lot?.earnedPoints ?? 0;
      const grantedPoints = lot?.grantedPoints ?? 0;
      const redeemedPoints = allocation?.redeemedPoints ?? 0;
      const expiredPoints = lot?.expiredPoints ?? 0;
      const outstandingPoints = lot?.outstandingPoints ?? 0;

      return {
        organizationId,
        organizationName,
        earnedPoints,
        grantedPoints,
        redeemedPoints,
        usedAtOwnStorePoints,
        usedAtOtherStoresPoints,
        otherStoresUsedHerePoints,
        crossStoreNetPoints,
        unusedRedeemedPoints: allocation?.unusedRedeemedPoints ?? 0,
        revokedPoints: allocation?.revokedPoints ?? 0,
        cancelledPoints: allocation?.cancelledPoints ?? 0,
        adjustedPoints: allocation?.adjustedPoints ?? 0,
        settledPoints: allocation?.settledPoints ?? 0,
        expiredPoints,
        outstandingPoints,
        unallocatedLegacyPoints: lot?.unallocatedLegacyPoints ?? 0,
        discountAmount:
          discounts.find((row) => row.organizationId === organizationId)
            ?.discountAmount ?? 0,
        amounts: accountingValuePerPoint
          ? {
              earnedAmount: toAmount(earnedPoints, accountingValuePerPoint),
              grantedAmount: toAmount(grantedPoints, accountingValuePerPoint),
              redeemedAmount: toAmount(redeemedPoints, accountingValuePerPoint),
              expiredAmount: toAmount(expiredPoints, accountingValuePerPoint),
              outstandingAmount: toAmount(
                outstandingPoints,
                accountingValuePerPoint,
              ),
              crossStoreNetAmount: toAmount(
                crossStoreNetPoints,
                accountingValuePerPoint,
              ),
            }
          : null,
      };
    };

    const legacy = rowOf(null, null);
    const hasLegacy = Object.values(legacy).some(
      (value) => typeof value === 'number' && value !== 0,
    );

    return {
      month,
      accountingValuePerPoint,
      rows: [
        ...organizations.map(({ id, name }) => rowOf(id, name)),
        ...(hasLegacy ? [legacy] : []),
      ],
    };
  }

  async getDetail(
    organizationId: string,
    month: string,
  ): Promise<PointReportDetailResponseDto> {
    const [setting, organizations, usage] = await Promise.all([
      this.pointSettingsService.get(),
      this.organizations(),
      this.usage(month),
    ]);
    const found = organizations.find(({ id }) => id === organizationId);
    if (!found) throw organizationNotFoundError();
    const { accountingValuePerPoint } = setting;

    const rows = [
      ...organizations,
      { id: null, name: null },
    ].flatMap<PointReportCounterpartDto>(({ id, name }) => {
      if (id === organizationId) return [];
      const pointsOf = (sourceId: string | null, consumerId: string | null) =>
        usage.find(
          (row) => row.sourceId === sourceId && row.consumerId === consumerId,
        )?.points ?? 0;
      const usedThereFromHerePoints = pointsOf(organizationId, id);
      const usedHereFromTherePoints = pointsOf(id, organizationId);
      if (usedThereFromHerePoints === 0 && usedHereFromTherePoints === 0)
        return [];
      const netPoints = usedThereFromHerePoints - usedHereFromTherePoints;

      return [
        {
          organizationId: id,
          organizationName: name,
          usedThereFromHerePoints,
          usedHereFromTherePoints,
          netPoints,
          netAmount: accountingValuePerPoint
            ? toAmount(netPoints, accountingValuePerPoint)
            : null,
        },
      ];
    });

    return {
      month,
      organizationId: found.id,
      organizationName: found.name,
      accountingValuePerPoint,
      rows,
    };
  }
}
