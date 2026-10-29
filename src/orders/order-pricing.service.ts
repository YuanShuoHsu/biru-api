import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { I18nContext, I18nService } from 'nestjs-i18n';

import { SERVING_TEMPERATURE_OF_LEVEL } from '../common/constants/serving-temperature.js';
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
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { localize } from '../menus/menus-public.service.js';

import type {
  CreateOrderItemAddOnDto,
  CreateOrderItemDto,
} from './dto/create-order.dto.js';
import { itemLeadTimeMinutes } from './prep-estimate.js';

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
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  private t(
    key: keyof I18nTranslations['common']['orders'],
    args?: Record<string, unknown>,
  ): string {
    return this.i18n.t(`common.orders.${key}`, {
      args,
      lang: I18nContext.current()?.lang,
    });
  }

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
        orderBy: [asc(offer.createdAt)],
      }),
      this.db.query.menuItemModifierGroup.findMany({
        where: inArray(menuItemModifierGroup.menuItemId, allMenuItemIds),
        with: { modifierGroup: true },
      }),
      this.db.query.menuItemAddOn.findMany({
        where: inArray(
          menuItemAddOn.menuItemId,
          items.map((i) => i.menuItemId),
        ),
      }),
    ]);
    if (!orgMenu) throw new NotFoundException(this.t('menuChanged'));

    const sections = await this.db.query.menuSection.findMany({
      columns: { id: true, parentSectionId: true },
      where: eq(menuSection.menuId, orgMenu.id),
    });
    const parentSectionIdOf = new Map(
      sections.map(({ id, parentSectionId }) => [id, parentSectionId]),
    );
    const sectionAncestry = (sectionId: string | null): string[] => {
      const ids: string[] = [];
      for (
        let id = sectionId;
        id && !ids.includes(id);
        id = parentSectionIdOf.get(id) ?? null
      )
        ids.push(id);
      return ids;
    };

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
      if (!item) throw new BadRequestException(this.t('menuChanged'));
      if (!item.availableModes.includes(mode))
        throw new BadRequestException(
          this.t('menuItemUnavailableForMode', {
            name: this.localName(item.name),
          }),
        );
      if (outsideAvailableHours.has(menuItemId))
        throw new BadRequestException(
          this.t('menuItemUnavailableAtTime', {
            name: this.localName(item.name),
          }),
        );
      const availability = offerMap.get(menuItemId)?.availability;
      if (availability === 'SoldOut' || availability === 'Discontinued')
        throw new BadRequestException(
          this.t('menuItemUnavailable', { name: this.localName(item.name) }),
        );
      return item;
    };

    const leadTimeOf = (menuItemId: string) =>
      offerMap.get(menuItemId)?.deliveryLeadTimeMinutes ?? 0;

    const orderedAt = new Date();

    const optionsInvalid = (item: ReturnType<typeof getMenuItem>) =>
      this.t('menuItemOptionsInvalid', { name: this.localName(item.name) });

    const getOfferPrice = (item: ReturnType<typeof getMenuItem>): string => {
      const offerRow = offerMap.get(item.id);
      const price =
        activePromoPrice(offerRow?.priceSpecification, orderedAt) ??
        offerRow?.price;
      if (!price)
        throw new BadRequestException(
          this.t('menuItemUnavailable', { name: this.localName(item.name) }),
        );
      return price;
    };

    const resolveServingTemperatureLevel = (
      item: ReturnType<typeof getMenuItem>,
      level: ServingTemperatureLevel | null | undefined,
    ): ServingTemperatureLevel | null => {
      if (item.servingTemperatures.length === 0) {
        if (level) throw new BadRequestException(optionsInvalid(item));
        return null;
      }
      if (!level) throw new BadRequestException(optionsInvalid(item));
      if (
        !item.servingTemperatures.includes(SERVING_TEMPERATURE_OF_LEVEL[level])
      )
        throw new BadRequestException(optionsInvalid(item));
      return level;
    };

    // 不可調時忽略客人帶的值，一律以品項設定為準；再訂一次會帶回舊訂單的固定甜度
    const resolveSweetnessLevel = (
      item: ReturnType<typeof getMenuItem>,
      level: SweetnessLevel | null | undefined,
    ): SweetnessLevel | null => {
      if (item.sweetness !== 'Adjustable') return item.fixedSweetnessLevel;
      if (!level) throw new BadRequestException(optionsInvalid(item));
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
          throw new BadRequestException(optionsInvalid(item));
        if (new Set(modIds).size !== modIds.length)
          throw new BadRequestException(optionsInvalid(item));
      }

      for (const { id, maxSelectionCount, minSelectionCount } of groups) {
        const count = modifiersInput[id]?.length ?? 0;
        if (
          count < minSelectionCount ||
          (maxSelectionCount != null && count > maxSelectionCount)
        )
          throw new BadRequestException(optionsInvalid(item));
      }

      return Object.entries(modifiersInput).flatMap(([groupId, modIds]) =>
        modIds.map((modId) => {
          const mod = modifierMap.get(modId);
          if (!mod || mod.modifierGroupId !== groupId)
            throw new BadRequestException(optionsInvalid(item));
          if (!mod.availableModes.includes(mode))
            throw new BadRequestException(
              this.t('modifierUnavailableForMode', {
                name: this.localName(mod.displayName),
              }),
            );
          if (
            mod.availability === 'SoldOut' ||
            mod.availability === 'Discontinued'
          )
            throw new BadRequestException(
              this.t('modifierUnavailable', {
                name: this.localName(mod.displayName),
              }),
            );
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
        throw new BadRequestException(optionsInvalid(parent));
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
        menuSectionIds: sectionAncestry(item.menuSectionId),
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
