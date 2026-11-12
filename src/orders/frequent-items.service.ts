import { Inject, Injectable } from '@nestjs/common';

import { and, asc, desc, eq, gte, ne, sql } from 'drizzle-orm';
import { getOrganizationIdBySlug } from '../common/utils/organizations.js';
import {
  order,
  orderItem,
  type OrderItem,
  type OrderItemModifierSnapshot,
} from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import { isCountedOrder } from './counted-orders.js';
import type {
  FrequentItemDto,
  FrequentItemsQueryDto,
} from './dto/frequent-items.dto.js';
import { OrderPricingService } from './order-pricing.service.js';

export const FREQUENT_ITEMS_WINDOW_DAYS = 90;

const toSelections = (modifiers: OrderItemModifierSnapshot[] | null) => {
  const selections: Record<string, string[]> = {};
  for (const { modifierGroupId, modifierId } of modifiers ?? [])
    (selections[modifierGroupId] ??= []).push(modifierId);
  return selections;
};

@Injectable()
export class FrequentItemsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly orderPricingService: OrderPricingService,
  ) {}

  async findForUser(
    userId: string,
    { organizationSlug, mode, limit }: FrequentItemsQueryDto,
  ): Promise<FrequentItemDto[]> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    const orderCount = sql<number>`count(distinct ${order.id})`;
    const lastOrderedAt = sql`max(${order.createdAt})`;
    const rows = await this.db
      .select({
        latest: sql<
          Pick<
            OrderItem,
            | 'addOns'
            | 'modifiers'
            | 'servingTemperatureLevel'
            | 'sweetnessLevel'
          >
        >`(array_agg(jsonb_build_object(
          'addOns', ${orderItem.addOns},
          'modifiers', ${orderItem.modifiers},
          'servingTemperatureLevel', ${orderItem.servingTemperatureLevel},
          'sweetnessLevel', ${orderItem.sweetnessLevel}
        ) ORDER BY ${order.createdAt} DESC, ${orderItem.createdAt} DESC, ${orderItem.id} DESC))[1]`,
        menuItemId: orderItem.menuItemId,
      })
      .from(order)
      .innerJoin(orderItem, eq(orderItem.orderId, order.id))
      .where(
        and(
          eq(order.userId, userId),
          gte(
            order.createdAt,
            new Date(
              Date.now() - FREQUENT_ITEMS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
            ),
          ),
          eq(order.sellerId, organizationId),
          isCountedOrder,
          ne(order.orderStatus, 'OrderReturned'),
        ),
      )
      .groupBy(orderItem.menuItemId)
      .having(gte(orderCount, 2))
      .orderBy(
        desc(orderCount),
        desc(lastOrderedAt),
        asc(orderItem.menuItemId),
      );

    const items = await this.orderPricingService.reconcileCustomizations(
      organizationId,
      rows.map(({ latest, menuItemId }) => ({
        menuItemId,
        modifiers: toSelections(latest.modifiers),
        addOns: (latest.addOns ?? []).map((addOn) => ({
          menuItemId: addOn.menuItemId,
          modifiers: toSelections(addOn.modifiers),
          servingTemperatureLevel: addOn.servingTemperatureLevel,
          sweetnessLevel: addOn.sweetnessLevel,
        })),
        servingTemperatureLevel: latest.servingTemperatureLevel,
        sweetnessLevel: latest.sweetnessLevel,
      })),
      mode,
    );

    return items.slice(0, limit);
  }
}
