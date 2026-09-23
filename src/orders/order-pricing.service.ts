import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { isWithinOpeningHours } from 'src/common/utils/opening-hours';

import { eq, inArray } from 'drizzle-orm';
import {
  DEFAULT_LANGUAGE,
  type LocalizedText,
  type ServingTemperature,
} from 'src/db/schema/enums';
import type { PriceSpecification } from 'src/db/schema/menus';
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
  servingTemperature: ServingTemperature | null;
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

    const [orgMenu, menuItems, modifiers, offers] = await Promise.all([
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

    // 有冷熱供應的品項必選其一；不分冷熱的品項不接受溫度
    const resolveServingTemperature = (
      item: ReturnType<typeof getMenuItem>,
      input: ServingTemperature | null | undefined,
    ): ServingTemperature | null => {
      if (item.servingTemperatures.length === 0) {
        if (input)
          throw new BadRequestException(
            `MenuItem ${item.id} has no serving temperatures`,
          );
        return null;
      }
      if (!input)
        throw new BadRequestException(
          `MenuItem ${item.id} requires a serving temperature`,
        );
      if (!item.servingTemperatures.includes(input))
        throw new BadRequestException(
          `MenuItem ${item.id} does not offer ${input}`,
        );
      return input;
    };

    const resolveModifierSnapshots = (
      modifiersInput: Record<string, string[]>,
      servingTemperature: ServingTemperature | null,
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
          const groupTemperature = mod.modifierGroup?.servingTemperature;
          if (groupTemperature && groupTemperature !== servingTemperature)
            throw new BadRequestException(
              `Modifier ${modId} is only available for ${groupTemperature}`,
            );
          return {
            modifierGroupId: mod.modifierGroupId,
            modifierGroupName: getName(mod.modifierGroup?.displayName),
            modifierId: mod.id,
            modifierName: getName(mod.displayName),
            priceAdjustment: mod.priceAdjustment,
          };
        });

    const resolveAddOnSnapshot = (
      addOn: CreateOrderItemAddOnDto,
    ): OrderItemAddOnSnapshot => {
      const item = getMenuItem(addOn.menuItemId);
      const servingTemperature = resolveServingTemperature(
        item,
        addOn.servingTemperature,
      );
      return {
        menuItemId: item.id,
        menuItemName: getName(item.name),
        unitPrice: getOfferPrice(addOn.menuItemId),
        modifiers: resolveModifierSnapshots(
          addOn.modifiers,
          servingTemperature,
        ),
        servingTemperature,
      };
    };

    return items.map((cartItem) => {
      const item = getMenuItem(cartItem.menuItemId);
      const servingTemperature = resolveServingTemperature(
        item,
        cartItem.servingTemperature,
      );
      const itemModifiers = resolveModifierSnapshots(
        cartItem.modifiers,
        servingTemperature,
      );
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
        servingTemperature,
      };
    });
  }
}
