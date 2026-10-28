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

import { order } from '../db/schema/orders.js';
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
  SalesReportGroupBy,
  SalesReportQueryDto,
  SalesReportResponseDto,
  SalesReportRowDto,
  SalesReportTotalsDto,
} from './dto/sales-report.dto.js';

const MAX_RANGE_DAYS = 366;

const localTime = (at: SQL | Column) =>
  sql`${at} AT TIME ZONE 'UTC' AT TIME ZONE ${PLATFORM_TIMEZONE}`;

const groupKeyOf = (groupBy: SalesReportGroupBy, at: SQL | Column) =>
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

    const [orderRows, refundRows] = await Promise.all([
      this.db
        .select({
          key: groupKeyOf(groupBy, COUNTED_AT),
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
            eq(order.sellerId, org.id),
            isCountedOrder,
            gte(COUNTED_AT, utcTimestampParam(since)),
            lt(COUNTED_AT, utcTimestampParam(until)),
          ),
        )
        .groupBy(sql`1`),
      this.db
        .select({
          key: groupKeyOf(groupBy, refund.createdAt),
          refunded: sql<number>`COALESCE(SUM(${refund.amount}), 0)`.mapWith(
            Number,
          ),
        })
        .from(refund)
        .innerJoin(order, eq(order.id, refund.orderId))
        .where(
          and(
            eq(order.sellerId, org.id),
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
    for (const row of rows) row.net = row.revenue - row.refunded;
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

    const totals = rows.reduce<SalesReportTotalsDto>(
      (sum, row) => ({
        orders: sum.orders + row.orders,
        revenue: sum.revenue + row.revenue,
        discount: sum.discount + row.discount,
        refunded: sum.refunded + row.refunded,
        net: sum.net + row.net,
      }),
      { orders: 0, revenue: 0, discount: 0, refunded: 0, net: 0 },
    );

    return { groupBy, rows, totals };
  }
}
