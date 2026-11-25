import type { OrderItem } from '../db/schema/orders.js';

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
