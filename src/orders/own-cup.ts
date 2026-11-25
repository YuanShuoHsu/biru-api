import { type SQL, sql } from 'drizzle-orm';

import { type OrderItem, orderItem } from '../db/schema/orders.js';

export const isOwnCupItem = ({
  addOns,
  modifiers,
}: Pick<OrderItem, 'addOns' | 'modifiers'>): boolean =>
  [modifiers, ...(addOns ?? []).map((addOn) => addOn.modifiers)]
    .flatMap((mods) => mods ?? [])
    .some((mod) => mod.customerProvidedCup);

export const awaitsCustomerCup = (
  item: Pick<OrderItem, 'addOns' | 'cupReceivedAt' | 'modifiers'>,
): boolean => !item.cupReceivedAt && isOwnCupItem(item);

// https://www.postgresql.org/docs/current/functions-json.html#FUNCTIONS-SQLJSON-PATH
export const awaitsCustomerCupSql: SQL = sql`(${orderItem.cupReceivedAt} is null and (jsonb_path_exists(coalesce(${orderItem.modifiers}, '[]'), '$[*] ? (@.customerProvidedCup == true)') or jsonb_path_exists(coalesce(${orderItem.addOns}, '[]'), '$[*].modifiers[*] ? (@.customerProvidedCup == true)')))`;
