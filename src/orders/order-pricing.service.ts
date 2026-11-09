import { randomUUID } from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { SERVING_TEMPERATURE_OF_LEVEL } from '../common/constants/serving-temperature.js';
import { platformDateString } from '../common/constants/timezone.js';
import { toLanguage } from '../common/utils/language.js';
import { isWithinOpeningHours } from '../common/utils/opening-hours.js';

import { asc, eq, inArray } from 'drizzle-orm';
import {
  DEFAULT_LANGUAGE,
  type LocalizedText,
  type ServingTemperatureLevel,
  type SweetnessLevel,
} from '../db/schema/enums.js';
import type { PriceSpecification } from '../db/schema/menus.js';
import {
  menu,
  menuItem,
  menuItemAddOn,
  menuItemModifierGroup,
  menuSection,
  modifier,
  offer,
} from '../db/schema/menus.js';
import type {
  OrderItemAddOnSnapshot,
  OrderItemModifierSnapshot,
  OrderMode,
} from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import { localize } from '../menus/menus-public.service.js';

import type {
  CreateOrderItemAddOnDto,
  CreateOrderItemDto,
} from './dto/create-order.dto.js';
import { badRequestError, notFoundError } from './order-errors.js';
import { itemLeadTimeMinutes } from './prep-estimate.js';

export const sectionAncestry = (
  parentSectionIdOf: Map<string, string | null>,
  sectionId: string | null,
): string[] => {
  const ids: string[] = [];
  for (
    let id = sectionId;
    id && !ids.includes(id);
    id = parentSectionIdOf.get(id) ?? null
  )
    ids.push(id);
  return ids;
};

const getName = (text: LocalizedText | null | undefined): string =>
  text?.[DEFAULT_LANGUAGE] || Object.values(text || {}).find(Boolean) || '';

// 店面判斷促銷是否進行中用同一個格式，改這裡要一起改
const PROMO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

const platformDateOf = (value: string): string | null => {
  if (!PROMO_DATE_PATTERN.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : platformDateString(date);
};

const activePromoPrice = (
  priceSpecification: PriceSpecification | null | undefined,
  at: Date,
): string | null => {
  if (!priceSpecification) return null;

  const { price, validFrom, validThrough } = priceSpecification;
  const today = platformDateString(at);

  if (validFrom) {
    const firstDay = platformDateOf(validFrom);
    if (!firstDay || today < firstDay) return null;
  }
  if (validThrough) {
    const lastDay = platformDateOf(validThrough);
    if (!lastDay || today > lastDay) return null;
  }

  return price || null;
};

const sumModifierAdjustments = (
  modifiers: OrderItemModifierSnapshot[],
): number =>
  modifiers.reduce((sum, mod) => sum + Number(mod.priceAdjustment ?? 0), 0);

export interface ResolvedOrderItem {
  id: string;
  addOns: OrderItemAddOnSnapshot[];
  leadTimeMinutes: number;
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

  private localName(text: LocalizedText | null | undefined): string {
    return localize(text, toLanguage(I18nContext.current()?.lang)) ?? '';
  }

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

    const [
      orgMenu,
      menuItems,
      modifiers,
      offers,
      itemModifierGroups,
      itemAddOns,
    ] = await Promise.all([
      this.db.query.menu.findFirst({
        columns: { id: true },
        where: eq(menu.organizationId, organizationId),
        with: { organization: { columns: { currency: true } } },
      }),
      this.db.query.menuItem.findMany({
        columns: { image: false },
        where: inArray(menuItem.id, allMenuItemIds),
        with: {
          menuSection: {
            columns: { menuId: true },
            with: { parentSection: { columns: { menuId: true } } },
          },
        },
      }),
      allModifierIds.length > 0
        ? this.db.query.modifier.findMany({
            where: inArray(modifier.id, allModifierIds),
            with: { modifierGroup: true },
          })
        : Promise.resolve([]),
      this.db.query.offer.findMany({
        where: inArray(offer.menuItemId, allMenuItemIds),
        orderBy: [asc(offer.createdAt)],
      }),
      this.db.query.menuItemModifierGroup.findMany({
        where: inArray(menuItemModifierGroup.menuItemId, allMenuItemIds),
        with: {
          modifierGroup: {
            with: {
              modifiers: {
                columns: { availability: true, availableModes: true },
              },
            },
          },
        },
      }),
      this.db.query.menuItemAddOn.findMany({
        where: inArray(
          menuItemAddOn.menuItemId,
          items.map((i) => i.menuItemId),
        ),
      }),
    ]);
    if (!orgMenu) throw notFoundError('menuChanged');

    const sections = await this.db.query.menuSection.findMany({
      columns: { id: true, parentSectionId: true },
      where: eq(menuSection.menuId, orgMenu.id),
    });
    const parentSectionIdOf = new Map(
      sections.map(({ id, parentSectionId }) => [id, parentSectionId]),
    );

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
      if (!item) throw badRequestError('menuChanged');
      if (!item.availableModes.includes(mode))
        throw badRequestError('menuItemUnavailableForMode', {
          name: this.localName(item.name),
        });
      if (outsideAvailableHours.has(menuItemId))
        throw badRequestError('menuItemUnavailableAtTime', {
          name: this.localName(item.name),
        });
      const availability = offerMap.get(menuItemId)?.availability;
      if (availability === 'SoldOut' || availability === 'Discontinued')
        throw badRequestError('menuItemUnavailable', {
          name: this.localName(item.name),
        });
      return item;
    };

    const leadTimeOf = (menuItemId: string) =>
      offerMap.get(menuItemId)?.deliveryLeadTimeMinutes ?? 0;

    const orderedAt = new Date();

    const optionsInvalid = (item: ReturnType<typeof getMenuItem>) =>
      badRequestError('menuItemOptionsInvalid', {
        name: this.localName(item.name),
      });

    const getOfferPrice = (item: ReturnType<typeof getMenuItem>): string => {
      const offerRow = offerMap.get(item.id);
      const price =
        activePromoPrice(offerRow?.priceSpecification, orderedAt) ??
        offerRow?.price;
      if (!price)
        throw badRequestError('menuItemUnavailable', {
          name: this.localName(item.name),
        });
      return price;
    };

    const resolveServingTemperatureLevel = (
      item: ReturnType<typeof getMenuItem>,
      level: ServingTemperatureLevel | null | undefined,
    ): ServingTemperatureLevel | null => {
      if (item.servingTemperatures.length === 0) {
        if (level) throw optionsInvalid(item);
        return null;
      }
      if (!level) throw optionsInvalid(item);
      if (
        !item.servingTemperatures.includes(SERVING_TEMPERATURE_OF_LEVEL[level])
      )
        throw optionsInvalid(item);
      return level;
    };

    // 不可調時忽略客人帶的值，一律以品項設定為準；再訂一次會帶回舊訂單的固定甜度
    const resolveSweetnessLevel = (
      item: ReturnType<typeof getMenuItem>,
      level: SweetnessLevel | null | undefined,
    ): SweetnessLevel | null => {
      if (item.sweetness !== 'Adjustable') return item.fixedSweetnessLevel;
      if (!level) throw optionsInvalid(item);
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
          throw optionsInvalid(item);
        if (new Set(modIds).size !== modIds.length) throw optionsInvalid(item);
      }

      for (const {
        id,
        maxSelectionCount,
        minSelectionCount,
        modifiers,
      } of groups) {
        const count = modifiersInput[id]?.length ?? 0;
        const listed = modifiers.filter(
          ({ availability }) => availability !== 'Discontinued',
        );
        const requiredCount =
          listed.length === 0 ||
          listed.some(({ availableModes }) => availableModes.includes(mode))
            ? minSelectionCount
            : 0;
        if (
          count < requiredCount ||
          (maxSelectionCount != null && count > maxSelectionCount)
        )
          throw optionsInvalid(item);
      }

      return Object.entries(modifiersInput).flatMap(([groupId, modIds]) =>
        modIds.map((modId) => {
          const mod = modifierMap.get(modId);
          if (!mod || mod.modifierGroupId !== groupId)
            throw optionsInvalid(item);
          if (!mod.availableModes.includes(mode))
            throw badRequestError('modifierUnavailableForMode', {
              name: this.localName(mod.displayName),
            });
          if (
            mod.availability === 'SoldOut' ||
            mod.availability === 'Discontinued'
          )
            throw badRequestError('modifierUnavailable', {
              name: this.localName(mod.displayName),
            });
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
      parent: ReturnType<typeof getMenuItem>,
      addOn: CreateOrderItemAddOnDto,
    ): OrderItemAddOnSnapshot => {
      const item = getMenuItem(addOn.menuItemId);
      if (
        item.id === parent.id ||
        !itemAddOns.some(
          (link) =>
            link.menuItemId === parent.id &&
            (link.addOnMenuItemId === item.id ||
              (!!item.menuSectionId &&
                link.addOnMenuSectionId === item.menuSectionId)),
        )
      )
        throw optionsInvalid(parent);
      const servingTemperatureLevel = resolveServingTemperatureLevel(
        item,
        addOn.servingTemperatureLevel,
      );
      const sweetnessLevel = resolveSweetnessLevel(item, addOn.sweetnessLevel);
      return {
        menuItemId: item.id,
        menuItemName: getName(item.name),
        unitPrice: getOfferPrice(item),
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
      const addOns = cartItem.addOns.map((addOn) =>
        resolveAddOnSnapshot(item, addOn),
      );

      const unitPrice =
        Number(getOfferPrice(item)) +
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
        leadTimeMinutes: itemLeadTimeMinutes(
          leadTimeOf,
          item.id,
          cartItem.addOns,
        ),
        menuItemId: item.id,
        menuItemName: getName(item.name),
        menuSectionIds: sectionAncestry(parentSectionIdOf, item.menuSectionId),
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
