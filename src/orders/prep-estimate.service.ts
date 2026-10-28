import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { type SQL, and, asc, eq, inArray } from 'drizzle-orm';

import { offer } from '../db/schema/menus.js';
import { order } from '../db/schema/orders.js';
import { type Organization, organization } from '../db/schema/organizations.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import type { PrepEstimateResponseDto } from './dto/prep-estimate-response.dto.js';
import {
  type QueuedOrder,
  displayPrepMinutes,
  estimatePrepMinutes,
  itemLeadTimeMinutes,
  orderPrepMinutes,
} from './prep-estimate.js';

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
    return estimatePrepMinutes(
      await this.queueOf(org),
      ownPrepMinutes,
      new Date(),
    ).minutes;
  }

  private async findWhere(where: SQL): Promise<PrepEstimateResponseDto | null> {
    const org = await this.db.query.organization.findFirst({
      columns: { id: true, pickupLeadMinutes: true },
      where,
    });
    if (!org) return null;

    const { minutes, queuedOrders } = estimatePrepMinutes(
      await this.queueOf(org),
      orderPrepMinutes(org.pickupLeadMinutes, []),
      new Date(),
    );

    return {
      basis: 'leadTime',
      estimatedMinutes: displayPrepMinutes(minutes),
      queuedOrders,
    };
  }

  private async queueOf(org: PrepEstimateOrganization): Promise<QueuedOrder[]> {
    const processing = await this.db.query.order.findMany({
      columns: { pickupTime: true },
      where: and(
        eq(order.sellerId, org.id),
        eq(order.orderStatus, 'OrderProcessing'),
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
    const leadTimeOf = (menuItemId: string) => leadTimes.get(menuItemId) ?? 0;

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
}
