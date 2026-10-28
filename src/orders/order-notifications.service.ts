import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  type SQL,
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sum,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { isAuthorized } from '../auth/permissions.js';
import { DAY_MS, platformMidnight } from '../common/constants/timezone.js';
import { utcTimestampParam } from '../common/utils/stats-buckets.js';
import { ingredient } from '../db/schema/inventory.js';
import { order } from '../db/schema/orders.js';
import { member, organization } from '../db/schema/organizations.js';
import { pointTransaction } from '../db/schema/points.js';
import { user } from '../db/schema/users.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import { MailsService } from '../mails/mails.service.js';

import { COUNTED_AT, isCountedOrder } from './counted-orders.js';
import { MenuItemSalesService } from './menu-item-sales.service.js';
import { OrderStatsService } from './order-stats.service.js';

const DASHBOARD_PAGE = '/dashboard';
const ORGANIZATIONS_PAGE = '/organizations';
const TOP_ITEM_LIMIT = 5;

const yesterdayOf = (now: Date) => {
  const until = new Date(platformMidnight(now.getTime()));
  return { since: new Date(until.getTime() - DAY_MS), until };
};

const adjustedBetween = (since: Date, until: Date) =>
  and(
    eq(pointTransaction.type, 'adjust'),
    gte(pointTransaction.createdAt, utcTimestampParam(since)),
    lt(pointTransaction.createdAt, utcTimestampParam(until)),
  );

const notBanned = (now: Date) =>
  or(isNull(user.banned), eq(user.banned, false), lt(user.banExpires, now));

const dashboardPath = (slug: string) =>
  `${DASHBOARD_PAGE}?${new URLSearchParams({ organization: slug, range: 'yesterday' })}`;

@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly mails: MailsService,
    private readonly menuItemSales: MenuItemSalesService,
    private readonly orderStats: OrderStatsService,
  ) {}

  async notifyDailySalesDigest(now = new Date()): Promise<number> {
    const { since, until } = yesterdayOf(now);

    const sellers = await this.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        currency: organization.currency,
      })
      .from(organization)
      .where(this.soldOrAdjustedBetween(since, until));
    if (!sellers.length) return 0;

    const members = await this.db
      .select({
        organizationId: member.organizationId,
        role: member.role,
        email: user.email,
        lang: user.lang,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          inArray(
            member.organizationId,
            sellers.map(({ id }) => id),
          ),
          notBanned(now),
        ),
      );

    const adjuster = alias(user, 'adjuster');
    const adjustments = await this.db
      .select({
        organizationId: pointTransaction.organizationId,
        adjuster: adjuster.name,
        member: user.name,
        points: pointTransaction.points,
        reason: pointTransaction.note,
      })
      .from(pointTransaction)
      .innerJoin(user, eq(user.id, pointTransaction.userId))
      .leftJoin(adjuster, eq(adjuster.id, pointTransaction.adjustedBy))
      .where(adjustedBetween(since, until))
      .orderBy(asc(pointTransaction.createdAt));

    let notified = 0;
    for (const seller of sellers) {
      const recipients = members.filter(
        ({ organizationId, role }) =>
          organizationId === seller.id &&
          isAuthorized(role, { revenue: ['read'] }),
      );
      if (!recipients.length) continue;

      try {
        const [{ buckets, hourlyOrders, previous, refundedOrders }, sales] =
          await Promise.all([
            this.dailyStats(seller.slug, since),
            this.menuItemSales.querySales(seller.id, since, until),
          ]);
        const peakOrders = Math.max(...hourlyOrders);
        const sellerAdjustments = adjustments.flatMap(
          ({ organizationId, ...adjustment }) =>
            organizationId === seller.id ? [adjustment] : [],
        );

        for (const recipient of recipients) {
          const pointAdjustments = recipient.role
            .split(',')
            .some((role) => role.trim() === 'owner')
            ? sellerAdjustments
            : [];
          if (!buckets[0].orders && !pointAdjustments.length) continue;

          try {
            await this.mails.sendDailySalesDigest({
              recipient,
              organizationName: seller.name,
              currency: seller.currency,
              date: since,
              path: dashboardPath(seller.slug),
              current: {
                orders: buckets[0].orders,
                revenue: buckets[0].revenue!,
              },
              previous: {
                orders: previous.orders,
                revenue: previous.revenue!,
              },
              peakHour: {
                hour: hourlyOrders.indexOf(peakOrders),
                orders: peakOrders,
              },
              pointAdjustments,
              refundedOrders,
              topItems: sales
                .filter(({ sold }) => sold > 0)
                .slice(0, TOP_ITEM_LIMIT)
                .map(({ menuItemName, sold }) => ({
                  name: menuItemName,
                  sold,
                })),
            });
            notified += 1;
          } catch (error) {
            this.logger.error(error);
          }
        }
      } catch (error) {
        this.logger.error(error);
      }
    }

    return notified;
  }

  async notifyPlatformDailyDigest(now = new Date()): Promise<number> {
    const admins = await this.db
      .select({ email: user.email, lang: user.lang })
      .from(user)
      .where(and(eq(user.role, 'admin'), notBanned(now)));
    if (!admins.length) return 0;

    const { since, until } = yesterdayOf(now);
    const [stores, adjustments, lowStock] = await Promise.all([
      this.db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          currency: organization.currency,
        })
        .from(organization)
        .where(
          or(
            this.soldOrAdjustedBetween(since, until),
            inArray(
              organization.id,
              this.db
                .select({ id: ingredient.organizationId })
                .from(ingredient)
                .where(
                  lte(ingredient.inventoryLevel, ingredient.lowStockThreshold),
                ),
            ),
          ),
        )
        .orderBy(asc(organization.name)),
      this.db
        .select({
          organizationId: pointTransaction.organizationId,
          count: count(),
          total: sum(pointTransaction.points).mapWith(Number),
        })
        .from(pointTransaction)
        .where(adjustedBetween(since, until))
        .groupBy(pointTransaction.organizationId),
      this.db
        .select({ organizationId: ingredient.organizationId, count: count() })
        .from(ingredient)
        .where(lte(ingredient.inventoryLevel, ingredient.lowStockThreshold))
        .groupBy(ingredient.organizationId),
    ]);

    const sections = [];
    for (const { id, name, slug, currency } of stores) {
      try {
        const { buckets, refundedOrders } = await this.dailyStats(slug, since);
        const adjusted = adjustments.find(
          ({ organizationId }) => organizationId === id,
        );
        sections.push({
          organizationName: name,
          currency,
          path: dashboardPath(slug),
          orders: buckets[0].orders,
          revenue: buckets[0].revenue!,
          refundedOrders,
          pointAdjustments: {
            count: adjusted?.count ?? 0,
            total: adjusted?.total ?? 0,
          },
          lowStock:
            lowStock.find(({ organizationId }) => organizationId === id)
              ?.count ?? 0,
        });
      } catch (error) {
        this.logger.error(error);
      }
    }
    if (!sections.length) return 0;

    let notified = 0;
    for (const recipient of admins) {
      try {
        await this.mails.sendPlatformDailyDigest({
          recipient,
          date: since,
          path: ORGANIZATIONS_PAGE,
          stores: sections,
        });
        notified += 1;
      } catch (error) {
        this.logger.error(error);
      }
    }

    return notified;
  }

  private soldOrAdjustedBetween(since: Date, until: Date): SQL | undefined {
    return or(
      inArray(
        organization.id,
        this.db
          .select({ id: order.sellerId })
          .from(order)
          .where(
            and(
              isCountedOrder,
              gte(COUNTED_AT, utcTimestampParam(since)),
              lt(COUNTED_AT, utcTimestampParam(until)),
            ),
          ),
      ),
      inArray(
        organization.id,
        this.db
          .select({ id: pointTransaction.organizationId })
          .from(pointTransaction)
          .where(adjustedBetween(since, until)),
      ),
    );
  }

  private dailyStats(slug: string, since: Date) {
    return this.orderStats.getStats(
      slug,
      {
        since: since.toISOString(),
        bucketUnit: 'day',
        bucketSize: 1,
        bucketCount: 1,
      },
      true,
    );
  }
}
