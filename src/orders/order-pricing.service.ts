import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { SERVING_TEMPERATURE_OF_LEVEL } from 'src/common/constants/serving-temperature';
import { isWithinOpeningHours } from 'src/common/utils/opening-hours';

import { eq, inArray } from 'drizzle-orm';
import {
  DEFAULT_LANGUAGE,
  type LocalizedText,
  type ServingTemperatureLevel,
  type SweetnessLevel,
} from 'src/db/schema/enums';
import type { PriceSpecification } from 'src/db/schema/menus';
import {
  menu,
  menuItem,
  menuItemModifierGroup,
  modifier,
  offer,
} from 'src/db/schema/menus';
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

const activePromoPrice = (
  priceSpecification: PriceSpecification | null | undefined,
  at: Date,
): string | null => {
  if (!priceSpecification) return null;

  const { price, validFrom, validThrough } = priceSpecification;

  if (validFrom && at < new Date(validFrom)) return null;
  if (validThrough && at > new Date(validThrough)) return null;

  return price || null;
};

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
  servingTemperatureLevel: ServingTemperatureLevel | null;
  sweetnessLevel: SweetnessLevel | null;
  unitPrice: string;
}

@Injectable()
export class OrderPricingService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async resolveOrderItems(
    organizationId: string,
    items: CreateOrderItemDto[],
    mode: OrderMode,
    availableAt: Date | null = null,
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

    const [orgMenu, menuItems, modifiers, offers, itemModifierGroups] =
      await Promise.all([
        this.db.query.menu.findFirst({
          where: eq(menu.organizationId, organizationId),
          with: { organization: { columns: { currency: true } } },
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
        this.db.query.menuItemModifierGroup.findMany({
          where: inArray(menuItemModifierGroup.menuItemId, allMenuItemIds),
          with: { modifierGroup: true },
        }),
      ]);
    if (!orgMenu) throw new NotFoundException('Menu not found');

    const priceCurrency = orgMenu.organization.currency;

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
    const groupsByMenuItemId = new Map<
      string,
      (typeof itemModifierGroups)[number]['modifierGroup'][]
    >();
    for (const { menuItemId, modifierGroup: group } of itemModifierGroups) {
      groupsByMenuItemId.set(menuItemId, [
        ...(groupsByMenuItemId.get(menuItemId) ?? []),
        group,
      ]);
    }
    const offerMap = new Map<string, (typeof offers)[number]>();
    const outsideAvailableHours = new Set<string>();
    for (const o of offers) {
      if (o.menuItemId && !offerMap.has(o.menuItemId)) {
        offerMap.set(o.menuItemId, o);

        if (availableAt && !isWithinOpeningHours(o.availableHours, availableAt))
          outsideAvailableHours.add(o.menuItemId);
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
      if (outsideAvailableHours.has(menuItemId))
        throw new BadRequestException(
          `MenuItem ${menuItemId} is unavailable at the requested time`,
        );
      return item;
    };

    const orderedAt = new Date();

    const getOfferPrice = (menuItemId: string): string => {
      const offerRow = offerMap.get(menuItemId);
      const price =
        activePromoPrice(offerRow?.priceSpecification, orderedAt) ??
        offerRow?.price;
      if (!price)
        throw new BadRequestException(
          `MenuItem ${menuItemId} has no offer price`,
        );
      return price;
    };

    const resolveServingTemperatureLevel = (
      item: ReturnType<typeof getMenuItem>,
      level: ServingTemperatureLevel | null | undefined,
    ): ServingTemperatureLevel | null => {
      if (item.servingTemperatures.length === 0) {
        if (level)
          throw new BadRequestException(
            `MenuItem ${item.id} has no serving temperatures`,
          );
        return null;
      }
      if (!level)
        throw new BadRequestException(
          `MenuItem ${item.id} requires a serving temperature level`,
        );
      if (
        !item.servingTemperatures.includes(SERVING_TEMPERATURE_OF_LEVEL[level])
      )
        throw new BadRequestException(
          `MenuItem ${item.id} does not offer ${level}`,
        );
      return level;
    };

    // 不可調時忽略客人帶的值，一律以品項設定為準；再訂一次會帶回舊訂單的固定甜度
    const resolveSweetnessLevel = (
      item: ReturnType<typeof getMenuItem>,
      level: SweetnessLevel | null | undefined,
    ): SweetnessLevel | null => {
      if (item.sweetness !== 'Adjustable') return item.fixedSweetnessLevel;
      if (!level)
        throw new BadRequestException(
          `MenuItem ${item.id} requires a sweetness level`,
        );
      return level;
    };

    const resolveModifierSnapshots = (
      item: ReturnType<typeof getMenuItem>,
      modifiersInput: Record<string, string[]>,
    ): OrderItemModifierSnapshot[] => {
      const groups = groupsByMenuItemId.get(item.id) ?? [];

      for (const [groupId, modIds] of Object.entries(modifiersInput)) {
        if (modIds.length === 0) continue;
        if (!groups.some(({ id }) => id === groupId))
          throw new BadRequestException(
            `ModifierGroup ${groupId} is unavailable for MenuItem ${item.id}`,
          );
        if (new Set(modIds).size !== modIds.length)
          throw new BadRequestException(
            `ModifierGroup ${groupId} has duplicate modifiers`,
          );
      }

      for (const { id, maxSelectionCount, minSelectionCount } of groups) {
        const count = modifiersInput[id]?.length ?? 0;
        if (
          count < minSelectionCount ||
          (maxSelectionCount != null && count > maxSelectionCount)
        )
          throw new BadRequestException(
            `ModifierGroup ${id} selection count ${count} is out of range`,
          );
      }

      return Object.entries(modifiersInput).flatMap(([groupId, modIds]) =>
        modIds.map((modId) => {
          const mod = modifierMap.get(modId);
          if (!mod || mod.modifierGroupId !== groupId)
            throw new BadRequestException(
              `Modifier ${modId} not found in ModifierGroup ${groupId}`,
            );
          if (!mod.availableModes.includes(mode))
            throw new BadRequestException(
              `Modifier ${modId} is unavailable for mode ${mode}`,
            );
          if (
            mod.availability === 'SoldOut' ||
            mod.availability === 'Discontinued'
          )
            throw new BadRequestException(`Modifier ${modId} is unavailable`);
          return {
            modifierGroupId: mod.modifierGroupId,
            modifierGroupName: getName(mod.modifierGroup?.displayName),
            modifierId: mod.id,
            modifierName: getName(mod.displayName),
            priceAdjustment: mod.priceAdjustment,
          };
        }),
      );
    };

    const resolveAddOnSnapshot = (
      addOn: CreateOrderItemAddOnDto,
    ): OrderItemAddOnSnapshot => {
      const item = getMenuItem(addOn.menuItemId);
      const servingTemperatureLevel = resolveServingTemperatureLevel(
        item,
        addOn.servingTemperatureLevel,
      );
      const sweetnessLevel = resolveSweetnessLevel(item, addOn.sweetnessLevel);
      return {
        menuItemId: item.id,
        menuItemName: getName(item.name),
        unitPrice: getOfferPrice(addOn.menuItemId),
        modifiers: resolveModifierSnapshots(item, addOn.modifiers),
        servingTemperatureLevel,
        sweetnessLevel,
      };
    };

    return items.map((cartItem) => {
      const item = getMenuItem(cartItem.menuItemId);
      const servingTemperatureLevel = resolveServingTemperatureLevel(
        item,
        cartItem.servingTemperatureLevel,
      );
      const sweetnessLevel = resolveSweetnessLevel(
        item,
        cartItem.sweetnessLevel,
      );
      const itemModifiers = resolveModifierSnapshots(item, cartItem.modifiers);
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
        // 訂單成立當下的幣別快照；店家日後改幣別不影響已成立的訂單
        priceCurrency,
        orderQuantity: cartItem.quantity,
        modifiers: itemModifiers,
        addOns,
        servingTemperatureLevel,
        sweetnessLevel,
      };
    });
  }
}
