import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  type Column,
  type SQL,
  and,
  count,
  eq,
  gte,
  lt,
  sql,
} from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';

import { DEFAULT_LANGUAGE, type LocalizedText } from '../db/schema/enums.js';
import { menuItem, menuSection } from '../db/schema/menus.js';
import { order, orderItem } from '../db/schema/orders.js';
import { organization } from '../db/schema/organizations.js';
import { refund } from '../db/schema/refunds.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { DAY_MS, PLATFORM_TIMEZONE } from '../common/constants/timezone.js';
import { utcTimestampParam } from '../common/utils/stats-buckets.js';
import {
  COUNTED_AT,
  isConfirmedRefund,
  isCountedOrder,
} from '../orders/counted-orders.js';

import type {
  ItemSalesReportGroupBy,
  OrderSalesReportGroupBy,
  SalesReportQueryDto,
  SalesReportResponseDto,
  SalesReportRowDto,
  SalesReportTotalsDto,
} from './dto/sales-report.dto.js';

const MAX_RANGE_DAYS = 366;

export const UNCATEGORIZED_KEY = 'uncategorized';

const isItemGroupBy = (
  groupBy: SalesReportQueryDto['groupBy'],
): groupBy is ItemSalesReportGroupBy =>
  groupBy === 'menuItem' || groupBy === 'category';

const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

const localTime = (at: SQL | Column) =>
  sql`${at} AT TIME ZONE 'UTC' AT TIME ZONE ${PLATFORM_TIMEZONE}`;

const groupKeyOf = (groupBy: OrderSalesReportGroupBy, at: SQL | Column) =>
  ({
    day: sql<string>`to_char(${localTime(at)}, 'YYYY-MM-DD')`,
    hour: sql<string>`EXTRACT(HOUR FROM ${localTime(at)})::int::text`,
    paymentMethod: sql<string>`${order.paymentMethod}::text`,
    mode: sql<string>`${order.mode}::text`,
  })[groupBy];

@Injectable()
export class SalesReportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  private t(key: keyof I18nTranslations['common']['reports']): string {
    return this.i18n.t(`common.reports.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  async getSalesReport(
    organizationSlug: string,
    { groupBy, ...range }: SalesReportQueryDto,
  ): Promise<SalesReportResponseDto> {
    const since = new Date(range.since);
    const until = new Date(range.until);
    if (until <= since) throw new BadRequestException(this.t('rangeInvalid'));
    if (until.getTime() - since.getTime() > MAX_RANGE_DAYS * DAY_MS)
      throw new BadRequestException(this.t('rangeTooLong'));

    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const rows = isItemGroupBy(groupBy)
      ? await this.itemRows(org.id, since, until, groupBy)
      : await this.orderRows(org.id, since, until, groupBy);
    rows.sort((a, b) => {
      switch (groupBy) {
        case 'day':
          return a.key.localeCompare(b.key);
        case 'hour':
          return Number(a.key) - Number(b.key);
        default:
          return b.revenue - a.revenue || a.key.localeCompare(b.key);
      }
    });

    const totalRows = isItemGroupBy(groupBy)
      ? await this.orderRows(org.id, since, until)
      : rows;
    const totals = totalRows.reduce<SalesReportTotalsDto>(
      (sum, row) => ({
        orders: sum.orders + row.orders,
        revenue: roundMoney(sum.revenue + row.revenue),
        discount: roundMoney(sum.discount + row.discount),
        refunded: roundMoney(sum.refunded + row.refunded),
        net: roundMoney(sum.net + row.net),
      }),
      { orders: 0, revenue: 0, discount: 0, refunded: 0, net: 0 },
    );

    return { groupBy, rows, totals };
  }

  private async orderRows(
    organizationId: string,
    since: Date,
    until: Date,
    groupBy?: OrderSalesReportGroupBy,
  ): Promise<SalesReportRowDto[]> {
    const [orderRows, refundRows] = await Promise.all([
      this.db
        .select({
          key: groupBy ? groupKeyOf(groupBy, COUNTED_AT) : sql<string>`''`,
          orders: count(),
          revenue: sql<number>`COALESCE(SUM(${order.total}), 0)`.mapWith(
            Number,
          ),
          discount: sql<number>`COALESCE(SUM(${order.discount}), 0)`.mapWith(
            Number,
          ),
        })
        .from(order)
        .where(
          and(
            eq(order.sellerId, organizationId),
            isCountedOrder,
            gte(COUNTED_AT, utcTimestampParam(since)),
            lt(COUNTED_AT, utcTimestampParam(until)),
          ),
        )
        .groupBy(sql`1`),
      this.db
        .select({
          key: groupBy
            ? groupKeyOf(groupBy, refund.createdAt)
            : sql<string>`''`,
          refunded: sql<number>`COALESCE(SUM(${refund.amount}), 0)`.mapWith(
            Number,
          ),
        })
        .from(refund)
        .innerJoin(order, eq(order.id, refund.orderId))
        .where(
          and(
            eq(order.sellerId, organizationId),
            isConfirmedRefund,
            gte(refund.createdAt, utcTimestampParam(since)),
            lt(refund.createdAt, utcTimestampParam(until)),
          ),
        )
        .groupBy(sql`1`),
    ]);

    const rowsByKey = new Map<string, SalesReportRowDto>();
    const rowOf = (key: string) => {
      const row = rowsByKey.get(key) ?? {
        key,
        orders: 0,
        revenue: 0,
        discount: 0,
        refunded: 0,
        net: 0,
      };
      rowsByKey.set(key, row);
      return row;
    };
    for (const { key, ...sales } of orderRows) Object.assign(rowOf(key), sales);
    for (const { key, refunded } of refundRows) rowOf(key).refunded = refunded;

    const rows = [...rowsByKey.values()];
    for (const row of rows) row.net = roundMoney(row.revenue - row.refunded);
    return rows;
  }

  private async itemRows(
    organizationId: string,
    since: Date,
    until: Date,
    groupBy: ItemSalesReportGroupBy,
  ): Promise<SalesReportRowDto[]> {
    const [key, name] = {
      menuItem: [
        sql`part.menu_item_id`,
        sql`COALESCE(
          (array_agg(${menuItem.name}))[1],
          jsonb_build_object(${DEFAULT_LANGUAGE}::text, (array_agg(part.menu_item_name ORDER BY ${orderItem.createdAt} DESC))[1])
        )`,
      ],
      category: [
        sql`COALESCE(${menuSection.id}, ${UNCATEGORIZED_KEY})`,
        sql`(array_agg(${menuSection.name}))[1]`,
      ],
    }[groupBy];

    const { rows } = await this.db.execute<{
      key: string;
      name: LocalizedText | null;
      orders: number;
      quantity: number;
      refundedQuantity: number;
      revenue: number;
      discount: number;
      refunded: number;
    }>(sql`
      WITH line AS (
        SELECT
          ${orderItem.id} AS order_item_id,
          ${order.id} AS order_id,
          ${orderItem.orderQuantity} AS quantity,
          0 AS refunded_quantity,
          ${orderItem.unitPrice} * ${orderItem.orderQuantity}
            / NULLIF(SUM(${orderItem.unitPrice} * ${orderItem.orderQuantity}) OVER (PARTITION BY ${order.id}), 0) AS share,
          ${order.total} AS revenue,
          COALESCE(${order.discount}, 0) AS discount,
          0 AS refunded
        FROM ${orderItem}
        JOIN ${order} ON ${order.id} = ${orderItem.orderId}
        WHERE ${and(
          eq(order.sellerId, organizationId),
          isCountedOrder,
          gte(COUNTED_AT, utcTimestampParam(since)),
          lt(COUNTED_AT, utcTimestampParam(until)),
        )}
        UNION ALL
        SELECT
          refunded_item.value ->> 'orderItemId',
          NULL,
          0,
          (refunded_item.value ->> 'quantity')::int,
          (refunded_item.value ->> 'amount')::numeric
            / NULLIF(SUM((refunded_item.value ->> 'amount')::numeric) OVER (PARTITION BY ${refund.id}), 0),
          0,
          0,
          ${refund.amount}
        FROM ${refund}
        JOIN ${order} ON ${order.id} = ${refund.orderId}
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(${refund.items}, '[]'::jsonb)) AS refunded_item
        WHERE ${and(
          eq(order.sellerId, organizationId),
          isConfirmedRefund,
          gte(refund.createdAt, utcTimestampParam(since)),
          lt(refund.createdAt, utcTimestampParam(until)),
        )}
      )
      SELECT
        ${key} AS key,
        ${name} AS name,
        COUNT(DISTINCT line.order_id)::int AS orders,
        SUM(line.quantity)::int AS quantity,
        SUM(line.refunded_quantity)::int AS "refundedQuantity",
        ROUND(COALESCE(SUM(line.share * part.share * line.revenue), 0), 2)::float8 AS revenue,
        ROUND(COALESCE(SUM(line.share * part.share * line.discount), 0), 2)::float8 AS discount,
        ROUND(COALESCE(SUM(line.share * part.share * line.refunded), 0), 2)::float8 AS refunded
      FROM line
      JOIN ${orderItem} ON ${orderItem.id} = line.order_item_id
      CROSS JOIN LATERAL (
        WITH add_on AS (
          SELECT
            add_on.value ->> 'menuItemId' AS menu_item_id,
            add_on.value ->> 'menuItemName' AS menu_item_name,
            (add_on.value ->> 'unitPrice')::numeric + COALESCE((
              SELECT SUM((modifier.value ->> 'priceAdjustment')::numeric)
              FROM jsonb_array_elements(add_on.value -> 'modifiers') AS modifier
            ), 0) AS price
          FROM jsonb_array_elements(COALESCE(${orderItem.addOns}, '[]'::jsonb)) AS add_on
        )
        SELECT
          ${orderItem.menuItemId},
          ${orderItem.menuItemName},
          (${orderItem.unitPrice} - COALESCE((SELECT SUM(price) FROM add_on), 0))
            / NULLIF(${orderItem.unitPrice}, 0)
        UNION ALL
        SELECT menu_item_id, menu_item_name, price / NULLIF(${orderItem.unitPrice}, 0)
        FROM add_on
      ) AS part(menu_item_id, menu_item_name, share)
      LEFT JOIN ${menuItem} ON ${menuItem.id} = part.menu_item_id
      LEFT JOIN ${menuSection} ON ${menuSection.id} = ${menuItem.menuSectionId}
      GROUP BY 1
    `);

    return rows.map((row) => ({
      ...row,
      net: roundMoney(row.revenue - row.refunded),
    }));
  }
}
