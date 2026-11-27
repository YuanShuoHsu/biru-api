import { and, eq, gte, inArray, notInArray, sql } from 'drizzle-orm';

import { order, orderItem } from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { businessDayStart } from '../inventory/offer-daily-limit.js';

import { badRequestError } from './order-errors.js';

export interface EligibleQuantityLimit {
  maxValue: number;
  name: string;
}

export const servingsByMenuItemId = (
  items: {
    addOns: { menuItemId: string }[];
    menuItemId: string;
    orderQuantity: number;
  }[],
): Map<string, number> => {
  const servings = new Map<string, number>();
  for (const { addOns, menuItemId, orderQuantity } of items)
    for (const id of [menuItemId, ...addOns.map((addOn) => addOn.menuItemId)])
      servings.set(id, (servings.get(id) ?? 0) + orderQuantity);
  return servings;
};

export const purchasedToday = async (
  db: Pick<DrizzleDB, 'execute'>,
  organizationId: string,
  userId: string,
  menuItemIds: string[],
): Promise<Map<string, number>> => {
  if (!menuItemIds.length) return new Map();

  const { rows } = await db.execute<{ menuItemId: string; quantity: number }>(
    sql`
      SELECT entry.menu_item_id AS "menuItemId", SUM(${orderItem.orderQuantity})::int AS quantity
      FROM ${orderItem}
      JOIN ${order} ON ${order.id} = ${orderItem.orderId}
      CROSS JOIN LATERAL (
        SELECT ${orderItem.menuItemId}
        UNION ALL
        SELECT add_on.value ->> 'menuItemId'
        FROM jsonb_array_elements(COALESCE(${orderItem.addOns}, '[]'::jsonb)) AS add_on
      ) AS entry(menu_item_id)
      WHERE ${and(
        eq(order.sellerId, organizationId),
        eq(order.userId, userId),
        gte(order.createdAt, businessDayStart(Date.now())),
        notInArray(order.orderStatus, [
          'OrderCancelled',
          'OrderProblem',
          'OrderReturned',
        ]),
        inArray(sql`entry.menu_item_id`, menuItemIds),
      )}
      GROUP BY entry.menu_item_id
    `,
  );

  return new Map(
    rows.map(({ menuItemId, quantity }) => [menuItemId, quantity]),
  );
};

export const assertEligibleQuantities = (
  limits: Map<string, EligibleQuantityLimit>,
  servings: Map<string, number>,
  purchased?: Map<string, number>,
): void => {
  for (const [menuItemId, { maxValue, name }] of limits) {
    const quantity = servings.get(menuItemId) ?? 0;
    if (!purchased) {
      if (quantity > maxValue)
        throw badRequestError('eligibleQuantityExceeded', { maxValue, name });
      continue;
    }

    const bought = purchased.get(menuItemId) ?? 0;
    if (bought + quantity > maxValue)
      throw badRequestError('memberEligibleQuantityExceeded', {
        maxValue,
        name,
        purchased: bought,
        remaining: Math.max(0, maxValue - bought),
      });
  }
};
