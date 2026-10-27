import { Inject, Injectable, Logger } from '@nestjs/common';

import { and, asc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { isAuthorized } from '../auth/permissions.js';
import { DAY_MS, platformMidnight } from '../common/constants/timezone.js';
import { utcTimestampParam } from '../common/utils/stats-buckets.js';
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
const TOP_ITEM_LIMIT = 5;

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
    const until = new Date(platformMidnight(now.getTime()));
    const since = new Date(until.getTime() - DAY_MS);

    const adjustedYesterday = and(
      eq(pointTransaction.type, 'adjust'),
      gte(pointTransaction.createdAt, utcTimestampParam(since)),
      lt(pointTransaction.createdAt, utcTimestampParam(until)),
    );

    const sellers = await this.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        currency: organization.currency,
      })
      .from(organization)
      .where(
        or(
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
              .where(adjustedYesterday),
          ),
        ),
      );
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
          or(
            isNull(user.banned),
            eq(user.banned, false),
            lt(user.banExpires, now),
          ),
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
      .where(adjustedYesterday)
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
            this.orderStats.getStats(
              seller.slug,
              {
                since: since.toISOString(),
                bucketUnit: 'day',
                bucketSize: 1,
                bucketCount: 1,
              },
              true,
            ),
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
              path: `${DASHBOARD_PAGE}?${new URLSearchParams({ organization: seller.slug, range: 'yesterday' })}`,
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
}
