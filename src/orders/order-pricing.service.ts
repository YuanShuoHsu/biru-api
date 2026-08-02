import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { eq, inArray } from 'drizzle-orm';
import { DEFAULT_LANGUAGE, type LocalizedText } from 'src/db/schema/enums';
import { menu, menuItem, modifier, offer } from 'src/db/schema/menus';
import type {
  OrderItemAddOnSnapshot,
  OrderItemModifierSnapshot,
  OrderMode,
} from 'src/db/schema/orders';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type {
  CreateOrderItemAddOnDto,
  CreateOrderItemDto,
} from './dto/create-order.dto';

const getName = (text: LocalizedText | null | undefined): string =>
  text?.[DEFAULT_LANGUAGE] || Object.values(text || {}).find(Boolean) || '';

const sumModifierAdjustments = (
  modifiers: OrderItemModifierSnapshot[],
): number =>
  modifiers.reduce((sum, mod) => sum + Number(mod.priceAdjustment ?? 0), 0);

export interface ResolvedOrderItem {
  id: string;
  addOns: OrderItemAddOnSnapshot[];
  menuItemId: string;
  menuItemName: string;
  menuSectionIds: string[];
  modifiers: OrderItemModifierSnapshot[];
  orderQuantity: number;
  priceCurrency: string;
  unitPrice: string;
}

@Injectable()
export class OrderPricingService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async resolveOrderItems(
    organizationId: string,
    items: CreateOrderItemDto[],
    mode: OrderMode,
  ): Promise<ResolvedOrderItem[]> {
    const allMenuItemIds = [
      ...new Set([
        ...items.map((i) => i.menuItemId),
        ...items.flatMap((i) => i.addOns.map((a) => a.menuItemId)),
      ]),
    ];

    const allModifierIds = [
      ...new Set([
        ...items.flatMap((i) => Object.values(i.modifiers).flat()),
        ...items.flatMap((i) =>
          i.addOns.flatMap((a) => Object.values(a.modifiers).flat()),
        ),
      ]),
    ];

    const [orgMenu, menuItems, modifiers, offers] = await Promise.all([
      this.db.query.menu.findFirst({
        where: eq(menu.organizationId, organizationId),
      }),
      this.db.query.menuItem.findMany({
        where: inArray(menuItem.id, allMenuItemIds),
        with: { menuSection: { with: { parentSection: true } } },
      }),
      allModifierIds.length > 0
        ? this.db.query.modifier.findMany({
            where: inArray(modifier.id, allModifierIds),
            with: { modifierGroup: true },
          })
        : Promise.resolve([]),
      this.db.query.offer.findMany({
        where: inArray(offer.menuItemId, allMenuItemIds),
      }),
    ]);
    if (!orgMenu) throw new NotFoundException('Menu not found');

    const menuItemMap = new Map(
      menuItems
        .filter(
          (m) =>
            m.menuId === orgMenu.id ||
            m.menuSection?.menuId === orgMenu.id ||
            m.menuSection?.parentSection?.menuId === orgMenu.id,
        )
        .map((m) => [m.id, m]),
    );
    const modifierMap = new Map<string, (typeof modifiers)[number]>();
    for (const m of modifiers) {
      if (m.modifierGroup?.menuId === orgMenu.id) modifierMap.set(m.id, m);
    }
    const offerMap = new Map<string, (typeof offers)[number]>();
    for (const o of offers) {
      if (o.menuItemId && !offerMap.has(o.menuItemId)) {
        offerMap.set(o.menuItemId, o);
      }
    }

    const getMenuItem = (menuItemId: string) => {
      const item = menuItemMap.get(menuItemId);
      if (!item)
        throw new BadRequestException(`MenuItem ${menuItemId} not found`);
      if (!item.availableModes.includes(mode))
        throw new BadRequestException(
          `MenuItem ${menuItemId} is unavailable for mode ${mode}`,
        );
      return item;
    };

    const getOfferPrice = (menuItemId: string): string => {
      const price = offerMap.get(menuItemId)?.price;
      if (!price)
        throw new BadRequestException(
          `MenuItem ${menuItemId} has no offer price`,
        );
      return price;
    };

    const resolveModifierSnapshots = (
      modifiersInput: Record<string, string[]>,
    ) =>
      Object.values(modifiersInput)
        .flat()
        .map((modId) => {
          const mod = modifierMap.get(modId);
          if (!mod)
            throw new BadRequestException(`Modifier ${modId} not found`);
          if (!mod.availableModes.includes(mode))
            throw new BadRequestException(
              `Modifier ${modId} is unavailable for mode ${mode}`,
            );
          return {
            modifierGroupId: mod.modifierGroupId,
            modifierGroupName: getName(mod.modifierGroup?.displayName),
            modifierId: mod.id,
            modifierName: getName(mod.displayName),
            priceAdjustment: mod.priceAdjustment,
          };
        });

    const resolveAddOnSnapshot = (addOn: CreateOrderItemAddOnDto) => {
      const item = getMenuItem(addOn.menuItemId);
      return {
        menuItemId: item.id,
        menuItemName: getName(item.name),
        unitPrice: getOfferPrice(addOn.menuItemId),
        modifiers: resolveModifierSnapshots(addOn.modifiers),
      };
    };

    return items.map((cartItem) => {
      const item = getMenuItem(cartItem.menuItemId);
      const itemModifiers = resolveModifierSnapshots(cartItem.modifiers);
      const addOns = cartItem.addOns.map(resolveAddOnSnapshot);

      const unitPrice =
        Number(getOfferPrice(cartItem.menuItemId)) +
        sumModifierAdjustments(itemModifiers) +
        addOns.reduce(
          (sum, addOn) =>
            sum +
            Number(addOn.unitPrice) +
            sumModifierAdjustments(addOn.modifiers),
          0,
        );

      return {
        id: randomUUID(),
        menuItemId: item.id,
        menuItemName: getName(item.name),
        menuSectionIds: [
          item.menuSectionId,
          item.menuSection?.parentSectionId,
        ].filter((id): id is string => !!id),
        unitPrice: unitPrice.toFixed(2),
        priceCurrency:
          offerMap.get(cartItem.menuItemId)?.priceCurrency ?? 'TWD',
        orderQuantity: cartItem.quantity,
        modifiers: itemModifiers,
        addOns,
      };
    });
  }
}
