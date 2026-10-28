import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { type SQL, and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import { utcTimestampParam } from '../common/utils/stats-buckets.js';

import { menu, menuItem, offer } from '../db/schema/menus.js';
import { order } from '../db/schema/orders.js';
import { type Organization, organization } from '../db/schema/organizations.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import type {
  PrepEstimateResponseDto,
  PrepTimeResponseDto,
} from './dto/prep-estimate-response.dto.js';
import { BOARD_AT, BOARD_WINDOW_MS } from './order-board-window.js';
import {
  type ObservedPace,
  type QueuedOrder,
  displayPrepMinutes,
  estimatePrepMinutes,
  itemLeadTimeMinutes,
  observedItemPrepMinutes,
  observedPace,
  orderPrepMinutes,
} from './prep-estimate.js';

const OBSERVED_WINDOW_MS = 30 * 60 * 1000;

const OBSERVED_ORDERS_LIMIT = 20;

const ITEM_OBSERVED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type PrepEstimateOrganization = Pick<Organization, 'id' | 'pickupLeadMinutes'>;

@Injectable()
export class PrepEstimateService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findBySlug(slug: string): Promise<PrepEstimateResponseDto> {
    const estimate = await this.findWhere(eq(organization.slug, slug));
    if (!estimate) throw new NotFoundException('Organization not found');
    return estimate;
  }

  findByOrganizationId(
    organizationId: string,
  ): Promise<PrepEstimateResponseDto | null> {
    return this.findWhere(eq(organization.id, organizationId));
  }

  async prepMinutesWith(
    org: PrepEstimateOrganization,
    ownPrepMinutes: number,
  ): Promise<number> {
    const now = new Date();
    const [queue, pace] = await Promise.all([
      this.queueOf(org, now),
      this.paceOf(org.id, now),
    ]);

    return estimatePrepMinutes(queue, ownPrepMinutes, now, pace).minutes;
  }

  async findPrepTimesBySlug(slug: string): Promise<PrepTimeResponseDto[]> {
    const org = await this.db.query.organization.findFirst({
      columns: { id: true },
      where: eq(organization.slug, slug),
    });
    if (!org) throw new NotFoundException('Organization not found');

    const [items, ready] = await Promise.all([
      this.db
        .select({ menuItemId: menuItem.id, name: menuItem.name })
        .from(menuItem)
        .innerJoin(menu, eq(menuItem.menuId, menu.id))
        .where(eq(menu.organizationId, org.id))
        .orderBy(asc(menuItem.createdAt), asc(menuItem.id)),
      this.db.query.order.findMany({
        columns: { orderDate: true, paymentDate: true, readyAt: true },
        where: and(
          eq(order.sellerId, org.id),
          gte(
            order.readyAt,
            utcTimestampParam(new Date(Date.now() - ITEM_OBSERVED_WINDOW_MS)),
          ),
        ),
        with: { items: { columns: { addOns: true, menuItemId: true } } },
      }),
    ]);
    const leadTimeOf = await this.leadTimesOf(
      items.map(({ menuItemId }) => menuItemId),
    );
    const observedOf = observedItemPrepMinutes(
      ready.map(({ items, orderDate, paymentDate, readyAt }) => ({
        menuItemIds: items.flatMap((item) => [
          item.menuItemId,
          ...(item.addOns ?? []).map((addOn) => addOn.menuItemId),
        ]),
        readyAt: readyAt!,
        startedAt: paymentDate ?? orderDate,
      })),
    );

    return items.map(({ menuItemId, name }) => ({
      menuItemId,
      name,
      leadTimeMinutes: leadTimeOf(menuItemId),
      ...observedOf(menuItemId),
    }));
  }

  async existingOrganizationIds(organizationIds: string[]): Promise<string[]> {
    if (!organizationIds.length) return [];

    const rows = await this.db
      .select({ id: organization.id })
      .from(organization)
      .where(inArray(organization.id, organizationIds));

    return rows.map(({ id }) => id);
  }

  private async findWhere(where: SQL): Promise<PrepEstimateResponseDto | null> {
    const org = await this.db.query.organization.findFirst({
      columns: { id: true, pickupLeadMinutes: true },
      where,
    });
    if (!org) return null;

    const now = new Date();
    const [queue, pace] = await Promise.all([
      this.queueOf(org, now),
      this.paceOf(org.id, now),
    ]);
    const { minutes, queuedOrders } = estimatePrepMinutes(
      queue,
      orderPrepMinutes(org.pickupLeadMinutes, []),
      now,
      pace,
    );

    return {
      basis: pace === null ? 'leadTime' : 'observed',
      estimatedMinutes: displayPrepMinutes(minutes),
      queuedOrders,
    };
  }

  private async paceOf(
    organizationId: string,
    now: Date,
  ): Promise<ObservedPace | null> {
    const ready = await this.db
      .select({
        readyAt: order.readyAt,
        startedAt:
          sql`COALESCE(${order.paymentDate}, ${order.orderDate})`.mapWith(
            order.orderDate,
          ),
      })
      .from(order)
      .where(
        and(
          eq(order.sellerId, organizationId),
          gte(
            order.readyAt,
            utcTimestampParam(new Date(now.getTime() - OBSERVED_WINDOW_MS)),
          ),
        ),
      )
      .orderBy(desc(order.readyAt))
      .limit(OBSERVED_ORDERS_LIMIT);

    return observedPace(
      ready.map(({ readyAt, startedAt }) => ({ readyAt: readyAt!, startedAt })),
    );
  }

  private async queueOf(
    org: PrepEstimateOrganization,
    now: Date,
  ): Promise<QueuedOrder[]> {
    const processing = await this.db.query.order.findMany({
      columns: { pickupTime: true },
      where: and(
        eq(order.sellerId, org.id),
        eq(order.orderStatus, 'OrderProcessing'),
        gte(
          BOARD_AT,
          utcTimestampParam(new Date(now.getTime() - BOARD_WINDOW_MS)),
        ),
      ),
      with: { items: { columns: { addOns: true, menuItemId: true } } },
    });

    const menuItemIds = [
      ...new Set(
        processing.flatMap(({ items }) =>
          items.flatMap((item) => [
            item.menuItemId,
            ...(item.addOns ?? []).map((addOn) => addOn.menuItemId),
          ]),
        ),
      ),
    ];
    const leadTimeOf = await this.leadTimesOf(menuItemIds);

    return processing.map(({ items, pickupTime }) => ({
      pickupTime,
      prepMinutes: orderPrepMinutes(
        org.pickupLeadMinutes,
        items.map((item) =>
          itemLeadTimeMinutes(leadTimeOf, item.menuItemId, item.addOns ?? []),
        ),
      ),
    }));
  }

  private async leadTimesOf(
    menuItemIds: string[],
  ): Promise<(menuItemId: string) => number> {
    const offers = menuItemIds.length
      ? await this.db.query.offer.findMany({
          columns: { deliveryLeadTimeMinutes: true, menuItemId: true },
          orderBy: [asc(offer.createdAt)],
          where: inArray(offer.menuItemId, menuItemIds),
        })
      : [];
    const leadTimes = new Map<string, number>();
    for (const o of offers)
      if (o.menuItemId && !leadTimes.has(o.menuItemId))
        leadTimes.set(o.menuItemId, o.deliveryLeadTimeMinutes ?? 0);
    return (menuItemId) => leadTimes.get(menuItemId) ?? 0;
  }
}
