import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  and,
  count,
  desc,
  asc,
  eq,
  gte,
  isNotNull,
  lt,
  sql,
} from 'drizzle-orm';
import { order } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import { refund } from 'src/db/schema/refunds';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type {
  ServingTemperatureLevel,
  SweetnessLevel,
} from 'src/db/schema/enums';

import { PLATFORM_TIMEZONE } from 'src/common/constants/timezone';
import type { StatsBucketQueryDto } from 'src/common/dto/stats-bucket-query.dto';
import {
  getStatsWindow,
  utcTimestampParam,
} from 'src/common/utils/stats-buckets';

import {
  COUNTED_AT,
  isConfirmedRefund,
  isCountedOrder,
  orderItemMovements,
} from './counted-orders';
import type {
  OrderStatsResponseDto,
  OrderStatsTotalsDto,
} from './dto/order-stats.dto';

const COUPON_LIMIT = 10;
const MODIFIER_LIMIT = 10;

@Injectable()
export class OrderStatsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getStats(
    organizationSlug: string,
    query: StatsBucketQueryDto,
    canReadRevenue: boolean,
  ): Promise<OrderStatsResponseDto> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const { bucketIndexOf, bucketStarts, previousSince, since, until } =
      getStatsWindow(query);

    const counted = and(eq(order.sellerId, org.id), isCountedOrder);
    const inRange = (from: Date, to: Date) =>
      and(
        counted,
        gte(COUNTED_AT, utcTimestampParam(from)),
        lt(COUNTED_AT, utcTimestampParam(to)),
      );
    const inPeriod = inRange(since, until);
    const refundsInRange = (from: Date, to: Date) =>
      and(
        eq(order.sellerId, org.id),
        isConfirmedRefund,
        gte(refund.createdAt, utcTimestampParam(from)),
        lt(refund.createdAt, utcTimestampParam(to)),
      );

    const totals = {
      orders: count(),
      revenue: sql<number>`COALESCE(SUM(${order.total}), 0)`.mapWith(Number),
      discount: sql<number>`COALESCE(SUM(${order.discount}), 0)`.mapWith(
        Number,
      ),
    };
    const refunded = {
      amount: sql<number>`COALESCE(SUM(${refund.amount}), 0)`.mapWith(Number),
    };
    const localHour = sql<number>`EXTRACT(HOUR FROM ${COUNTED_AT} AT TIME ZONE 'UTC' AT TIME ZONE ${PLATFORM_TIMEZONE})::int`;

    const servedLevels = <Level extends string>(
      column: 'serving_temperature_level' | 'sweetness_level',
    ) => {
      const addOnKey =
        column === 'sweetness_level'
          ? 'sweetnessLevel'
          : 'servingTemperatureLevel';

      return this.db.execute<{ level: Level; sold: number }>(sql`
        WITH movements AS (${orderItemMovements(org.id, since, until)}),
        served AS (
          SELECT oi.${sql.raw(column)}::text AS level, m.quantity
          FROM movements m
          JOIN order_item oi ON oi.id = m.order_item_id
          UNION ALL
          SELECT add_on.value ->> ${addOnKey}, m.quantity
          FROM movements m
          JOIN order_item oi ON oi.id = m.order_item_id
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(oi.add_ons, '[]'::jsonb)) AS add_on
        )
        SELECT level, SUM(quantity)::int AS sold
        FROM served
        WHERE level IS NOT NULL
        GROUP BY level
      `);
    };

    const [
      [{ lifetimeOrders }],
      bucketRows,
      [previous],
      refundBucketRows,
      [previousRefunded],
      hourRows,
      modes,
      paymentMethods,
      coupons,
      modifierRows,
      sweetnessRows,
      servingTemperatureRows,
    ] = await Promise.all([
      this.db.select({ lifetimeOrders: count() }).from(order).where(counted),
      this.db
        .select({ index: bucketIndexOf(COUNTED_AT), ...totals })
        .from(order)
        .where(inPeriod)
        .groupBy(sql`1`),
      this.db.select(totals).from(order).where(inRange(previousSince, since)),
      this.db
        .select({ index: bucketIndexOf(refund.createdAt), ...refunded })
        .from(refund)
        .innerJoin(order, eq(order.id, refund.orderId))
        .where(refundsInRange(since, until))
        .groupBy(sql`1`),
      this.db
        .select(refunded)
        .from(refund)
        .innerJoin(order, eq(order.id, refund.orderId))
        .where(refundsInRange(previousSince, since)),
      this.db
        .select({ hour: localHour, orders: count() })
        .from(order)
        .where(inPeriod)
        .groupBy(sql`1`),
      this.db
        .select({ mode: order.mode, orders: count() })
        .from(order)
        .where(inPeriod)
        .groupBy(order.mode),
      this.db
        .select({ paymentMethod: order.paymentMethod, orders: count() })
        .from(order)
        .where(inPeriod)
        .groupBy(order.paymentMethod),
      this.db
        .select({ code: sql<string>`${order.discountCode}`, orders: count() })
        .from(order)
        .where(and(inPeriod, isNotNull(order.discountCode)))
        .groupBy(order.discountCode)
        .orderBy(desc(count()), asc(order.discountCode))
        .limit(COUPON_LIMIT),
      this.db.execute<{
        modifierGroupName: string;
        modifierId: string;
        modifierName: string;
        sold: number;
      }>(sql`
        WITH movements AS (${orderItemMovements(org.id, since, until)}),
        chosen AS (
          SELECT chosen_modifier.value AS modifier, m.quantity, oi.created_at
          FROM movements m
          JOIN order_item oi ON oi.id = m.order_item_id
          CROSS JOIN LATERAL (
            SELECT value FROM jsonb_array_elements(COALESCE(oi.modifiers, '[]'::jsonb))
            UNION ALL
            SELECT add_on_modifier.value
            FROM jsonb_array_elements(COALESCE(oi.add_ons, '[]'::jsonb)) AS add_on
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(add_on.value -> 'modifiers', '[]'::jsonb)) AS add_on_modifier
          ) AS chosen_modifier
        )
        SELECT
          modifier ->> 'modifierId' AS "modifierId",
          (array_agg(modifier ->> 'modifierGroupName' ORDER BY created_at DESC))[1] AS "modifierGroupName",
          (array_agg(modifier ->> 'modifierName' ORDER BY created_at DESC))[1] AS "modifierName",
          SUM(quantity)::int AS sold
        FROM chosen
        GROUP BY 1
        HAVING SUM(quantity) > 0
        ORDER BY sold DESC, 1
        LIMIT ${MODIFIER_LIMIT}
      `),
      servedLevels<SweetnessLevel>('sweetness_level'),
      servedLevels<ServingTemperatureLevel>('serving_temperature_level'),
    ]);

    const toTotals = (
      { discount, orders, revenue }: Required<OrderStatsTotalsDto>,
      refundedAmount: number,
    ): OrderStatsTotalsDto =>
      canReadRevenue
        ? { discount, orders, revenue: revenue - refundedAmount }
        : { orders };

    const bucketByIndex = new Map(bucketRows.map((row) => [row.index, row]));
    const refundedByIndex = new Map(
      refundBucketRows.map(({ amount, index }) => [index, amount]),
    );
    const hourlyOrders = Array<number>(24).fill(0);
    for (const { hour, orders } of hourRows) hourlyOrders[hour] = orders;

    return {
      lifetimeOrders,
      buckets: bucketStarts.map((start, index) => ({
        start,
        ...toTotals(
          bucketByIndex.get(index) ?? { discount: 0, orders: 0, revenue: 0 },
          refundedByIndex.get(index) ?? 0,
        ),
      })),
      previous: toTotals(previous, previousRefunded.amount),
      hourlyOrders,
      modes,
      paymentMethods,
      coupons,
      modifiers: modifierRows.rows,
      sweetnessLevels: sweetnessRows.rows,
      servingTemperatureLevels: servingTemperatureRows.rows,
    };
  }
}
