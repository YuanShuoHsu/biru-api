import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  Column,
  SQL,
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  is,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { v4 as uuidv4 } from 'uuid';
import { I18nContext, I18nService } from 'nestjs-i18n';

import type { Transaction } from '../attendance/attendance-audit.js';
import { SERVING_TEMPERATURE_OF_LEVEL } from '../common/constants/serving-temperature.js';
import { toLanguage } from '../common/utils/language.js';
import {
  isSameLocalizedText,
  localizedTextSql,
} from '../common/utils/localized-text.js';
import { getOrganizationCurrency } from '../common/utils/organizations.js';
import type { LocalizedText } from '../db/schema/enums.js';
import { recipe } from '../db/schema/inventory.js';
import type {
  Menu,
  MenuItem,
  MenuItemAddOn,
  MenuItemModifierGroup,
  MenuSection,
  Modifier,
  ModifierGroup,
  Offer,
  QuantitativeValue,
} from '../db/schema/menus.js';
import {
  menu,
  menuItem,
  menuItemAddOn,
  menuItemModifierGroup,
  menuSection,
  modifier,
  modifierGroup,
  offer,
} from '../db/schema/menus.js';
import { printer } from '../db/schema/printers.js';
import { startDeletedRecordBatch } from '../deleted-records/request-batch.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { bindRecipeByMenuItemName } from '../inventory/recipe-menu-item-binding.js';
import { keepAutoSoldOut } from '../inventory/menu-stock.service.js';
import { RecipesService } from '../inventory/recipes.service.js';
import type { OrderTicketPrinterOptionDto } from '../orders/dto/order-ticket.dto.js';

import {
  buildArrayOverlapCondition,
  buildFilterCondition,
  buildLocalizedTextFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from '../common/utils/data-grid-filters.js';

import {
  ADD_ON_DATE_FILTER_FIELDS,
  ADD_ON_STRING_FILTER_FIELDS,
  type AddOnPaginationQueryDto,
} from './dto/add-on-pagination-query.dto.js';
import type { CreateMenuItemAddOnDto } from './dto/create-menu-item-add-on.dto.js';
import type { CreateMenuItemModifierGroupDto } from './dto/create-menu-item-modifier-group.dto.js';
import type { CreateMenuItemDto } from './dto/create-menu-item.dto.js';
import type { CreateMenuSectionDto } from './dto/create-menu-section.dto.js';
import type { CreateModifierGroupDto } from './dto/create-modifier-group.dto.js';
import type { CreateModifierDto } from './dto/create-modifier.dto.js';
import type { CreateOfferDto } from './dto/create-offer.dto.js';
import {
  MENU_ITEM_ARRAY_ENUM_FILTER_FIELDS,
  MENU_ITEM_DATE_FILTER_FIELDS,
  MENU_ITEM_ENUM_FILTER_FIELDS,
  MENU_ITEM_NUMBER_FILTER_FIELDS,
  MENU_ITEM_PLAIN_DATE_FILTER_FIELDS,
  MENU_ITEM_QUICK_FILTER_ENUM_FIELDS,
  MENU_ITEM_STRING_FILTER_FIELDS,
  MenuItemPaginationQueryDto,
} from './dto/menu-item-pagination-query.dto.js';
import {
  MENU_SECTION_DATE_FILTER_FIELDS,
  MENU_SECTION_STRING_FILTER_FIELDS,
  MenuSectionPaginationQueryDto,
} from './dto/menu-section-pagination-query.dto.js';
import {
  MODIFIER_GROUP_DATE_FILTER_FIELDS,
  MODIFIER_GROUP_NUMBER_FILTER_FIELDS,
  MODIFIER_GROUP_STRING_FILTER_FIELDS,
  type ModifierGroupPaginationQueryDto,
} from './dto/modifier-group-pagination-query.dto.js';
import {
  MODIFIER_ARRAY_ENUM_FILTER_FIELDS,
  MODIFIER_DATE_FILTER_FIELDS,
  MODIFIER_ENUM_FILTER_FIELDS,
  MODIFIER_NUMBER_FILTER_FIELDS,
  MODIFIER_QUICK_FILTER_ENUM_FIELDS,
  MODIFIER_STRING_FILTER_FIELDS,
  type ModifierPaginationQueryDto,
} from './dto/modifier-pagination-query.dto.js';
import type { UpdateMenuItemAddOnDto } from './dto/update-menu-item-add-on.dto.js';
import type { UpdateMenuItemDto } from './dto/update-menu-item.dto.js';
import type { UpdateMenuSectionDto } from './dto/update-menu-section.dto.js';
import type { UpdateMenuDto } from './dto/update-menu.dto.js';
import type { UpdateModifierGroupDto } from './dto/update-modifier-group.dto.js';
import type { UpdateModifierDto } from './dto/update-modifier.dto.js';
import type { UpdateOfferAvailabilityDto } from './dto/update-offer-availability.dto.js';
import type { UpdateOfferDto } from './dto/update-offer.dto.js';
import { badRequestError, notFoundError } from './menu-errors.js';

type RecipeSummary = {
  id: string;
  name: LocalizedText;
  recipeYield: number;
};

type OfferWithCurrency = Offer & { priceCurrency: string };

type ModifierWithCurrency = Modifier & { priceCurrency: string };

type MenuItemWithRecipe = MenuItem & {
  offer: OfferWithCurrency | null;
  recipe: (RecipeSummary & { cost?: number | null }) | null;
};

type DrinkOptions = Pick<
  MenuItem,
  | 'servingTemperatures'
  | 'recommendedServingTemperatureLevel'
  | 'sweetness'
  | 'fixedSweetnessLevel'
  | 'recommendedSweetnessLevel'
>;

const DRINK_OPTION_FIELDS = [
  'servingTemperatures',
  'recommendedServingTemperatureLevel',
  'sweetness',
  'fixedSweetnessLevel',
  'recommendedSweetnessLevel',
] as const satisfies readonly (keyof DrinkOptions)[];

const literalDefault = <T>(value: T | SQL | undefined): T => {
  if (value === undefined || is(value, SQL))
    throw new Error('Expected a literal column default');

  return value;
};

const NEW_MENU_ITEM_DRINK_OPTIONS: DrinkOptions = {
  servingTemperatures: literalDefault(menuItem.servingTemperatures.default),
  recommendedServingTemperatureLevel: null,
  sweetness: literalDefault(menuItem.sweetness.default),
  fixedSweetnessLevel: null,
  recommendedSweetnessLevel: null,
};

const resolveDrinkOptions = (
  current: DrinkOptions,
  data: UpdateMenuItemDto,
): Omit<DrinkOptions, 'servingTemperatures' | 'sweetness'> => {
  const next = <K extends keyof DrinkOptions>(field: K): DrinkOptions[K] =>
    data[field] === undefined
      ? current[field]
      : (data[field] as DrinkOptions[K]);

  const sweetness = next('sweetness');
  const servingTemperatures = next('servingTemperatures');
  const temperatureLevel = next('recommendedServingTemperatureLevel');
  const fixedSweetnessLevel =
    sweetness === 'Fixed' ? next('fixedSweetnessLevel') : null;
  if (sweetness === 'Fixed' && !fixedSweetnessLevel)
    throw badRequestError('fixedSweetnessLevelRequired');

  return {
    recommendedServingTemperatureLevel:
      temperatureLevel &&
      servingTemperatures.includes(
        SERVING_TEMPERATURE_OF_LEVEL[temperatureLevel],
      )
        ? temperatureLevel
        : null,
    fixedSweetnessLevel,
    recommendedSweetnessLevel:
      sweetness === 'Adjustable' ? next('recommendedSweetnessLevel') : null,
  };
};

const withCurrency = (
  row: Offer | null | undefined,
  priceCurrency: string,
): OfferWithCurrency | null => (row ? { ...row, priceCurrency } : null);

@Injectable()
export class MenusService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly recipesService: RecipesService,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  private t(key: keyof I18nTranslations['common']['menus']): string {
    return this.i18n.t(`common.menus.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  private async recipeWithCost(
    found: RecipeSummary | null | undefined,
    canReadPurchasing = true,
  ): Promise<(RecipeSummary & { cost?: number | null }) | null> {
    if (!found) return null;
    if (!canReadPurchasing) return found;

    const costs = await this.recipesService.costsOf([found.id]);

    return { ...found, cost: costs.get(found.id) ?? null };
  }

  // ── Menu ──────────────────────────────────────────────────────────

  async menus(organizationId: string): Promise<Menu[]> {
    return this.db.query.menu.findMany({
      where: eq(menu.organizationId, organizationId),
    });
  }

  async menu(where: { id: string }): Promise<Menu | null> {
    const result = await this.db.query.menu.findFirst({
      where: eq(menu.id, where.id),
    });

    return result || null;
  }

  async updateMenu(params: {
    where: { id: string };
    data: UpdateMenuDto;
  }): Promise<Menu> {
    const [updated] = await this.db
      .update(menu)
      .set({ ...params.data, updatedAt: new Date() })
      .where(eq(menu.id, params.where.id))
      .returning();

    return updated;
  }

  // ── MenuSection ───────────────────────────────────────────────────

  private async validateParentSection(
    tx: Transaction,
    menuId: string,
    parentSectionId: string | null | undefined,
    sectionId?: string,
  ): Promise<void> {
    if (!parentSectionId) return;
    if (parentSectionId === sectionId)
      throw new BadRequestException(this.t('parentSectionSelf'));

    await tx
      .select({ id: menu.id })
      .from(menu)
      .where(eq(menu.id, menuId))
      .for('update');

    const { rows: ancestors } = await tx.execute<{
      id: string;
      menu_id: string;
    }>(sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, menu_id, parent_section_id FROM menu_section
        WHERE id = ${parentSectionId}
        UNION
        SELECT s.id, s.menu_id, s.parent_section_id FROM menu_section s
        JOIN ancestors a ON s.id = a.parent_section_id
      )
      SELECT id, menu_id FROM ancestors
    `);

    if (ancestors.find(({ id }) => id === parentSectionId)?.menu_id !== menuId)
      throw notFoundError('parentSectionNotFound');
    if (sectionId && ancestors.some(({ id }) => id === sectionId))
      throw new BadRequestException(this.t('parentSectionDescendant'));
  }

  private async validateOrderTicketPrinter(
    tx: Pick<DrizzleDB, 'select'>,
    menuId: string,
    printerId: string | null | undefined,
  ): Promise<void> {
    if (!printerId) return;

    const [found] = await tx
      .select({ id: printer.id })
      .from(printer)
      .innerJoin(menu, eq(menu.organizationId, printer.organizationId))
      .where(
        and(
          eq(menu.id, menuId),
          eq(printer.id, printerId),
          eq(printer.purpose, 'orderTicket'),
        ),
      );
    if (!found) throw notFoundError('printerNotFound');
  }

  orderTicketPrinters(menuId: string): Promise<OrderTicketPrinterOptionDto[]> {
    return this.db
      .select({
        id: printer.id,
        isDefault: printer.isDefault,
        name: printer.name,
      })
      .from(printer)
      .innerJoin(menu, eq(menu.organizationId, printer.organizationId))
      .where(and(eq(menu.id, menuId), eq(printer.purpose, 'orderTicket')))
      .orderBy(asc(printer.createdAt), asc(printer.id));
  }

  async createMenuSection(
    menuId: string,
    data: CreateMenuSectionDto,
  ): Promise<MenuSection> {
    return this.db.transaction(async (tx) => {
      await this.validateParentSection(tx, menuId, data.parentSectionId);
      await this.validateOrderTicketPrinter(
        tx,
        menuId,
        data.orderTicketPrinterId,
      );

      await tx
        .update(menuSection)
        .set({ sortOrder: sql`${menuSection.sortOrder} + 1` })
        .where(eq(menuSection.menuId, menuId));

      const [created] = await tx
        .insert(menuSection)
        .values({ id: uuidv4(), menuId, sortOrder: 0, ...data })
        .returning();

      return created;
    });
  }

  async menuSections(
    menuId: string,
    query: MenuSectionPaginationQueryDto = {},
  ): Promise<{ data: MenuSection[]; total: number }> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterValue,
      searchField,
      searchOperator,
      searchValue,
      sortBy,
      sortDirection = 'desc',
    } = query;

    const localizedFields: Record<string, Column> = {
      name: menuSection.name,
      description: menuSection.description,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] = sortBy
      ? [
          dir(
            localizedFields[sortBy]
              ? localizedTextSql(
                  localizedFields[sortBy],
                  toLanguage(I18nContext.current()?.lang),
                )
              : menuSection[sortBy],
          ),
        ]
      : [asc(menuSection.sortOrder), asc(menuSection.id)];

    const sectionFieldMap: Record<string, Column | SQL> = {
      createdAt: menuSection.createdAt,
      updatedAt: menuSection.updatedAt,
    };

    const where = and(
      eq(menuSection.menuId, menuId),
      filterField && filterOperator && localizedFields[filterField]
        ? buildLocalizedTextFilterCondition(
            localizedFields[filterField],
            filterOperator,
            filterValue,
          )
        : filterField && filterOperator
          ? buildFilterCondition(
              filterField,
              filterOperator,
              filterValue,
              sectionFieldMap,
              MENU_SECTION_STRING_FILTER_FIELDS,
              MENU_SECTION_DATE_FILTER_FIELDS,
            )
          : undefined,
      quickFilterValue
        ? or(
            buildLocalizedTextFilterCondition(
              menuSection.name,
              'contains',
              quickFilterValue,
            ),
            buildLocalizedTextFilterCondition(
              menuSection.description,
              'contains',
              quickFilterValue,
            ),
            ilike(
              localTimeText(menuSection.createdAt),
              `%${quickFilterValue}%`,
            ),
            ilike(
              localTimeText(menuSection.updatedAt),
              `%${quickFilterValue}%`,
            ),
          )
        : undefined,
      searchField && searchOperator && searchValue
        ? buildLocalizedTextFilterCondition(
            localizedFields[searchField],
            searchOperator,
            searchValue,
          )
        : undefined,
    );

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(menuSection)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(menuSection).where(where),
    ]);

    return { data, total };
  }

  async reorderMenuSections(
    menuId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(menuSection)
          .set({ sortOrder: offset + i })
          .where(and(eq(menuSection.id, id), eq(menuSection.menuId, menuId)));
      }
    });
  }

  async menuSection(where: { id: string }): Promise<MenuSection | null> {
    const result = await this.db.query.menuSection.findFirst({
      where: eq(menuSection.id, where.id),
    });

    return result || null;
  }

  async updateMenuSection(params: {
    where: { id: string };
    data: UpdateMenuSectionDto;
  }): Promise<MenuSection> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ menuId: menuSection.menuId })
        .from(menuSection)
        .where(eq(menuSection.id, params.where.id));
      if (!current) throw notFoundError('menuSectionNotFound');
      await this.validateParentSection(
        tx,
        current.menuId,
        params.data.parentSectionId,
        params.where.id,
      );
      await this.validateOrderTicketPrinter(
        tx,
        current.menuId,
        params.data.orderTicketPrinterId,
      );

      const [updated] = await tx
        .update(menuSection)
        .set({ ...params.data, updatedAt: new Date() })
        .where(eq(menuSection.id, params.where.id))
        .returning();

      return updated;
    });
  }

  async deleteMenuSection(where: { id: string }): Promise<MenuSection> {
    const [deleted] = await this.db
      .delete(menuSection)
      .where(eq(menuSection.id, where.id))
      .returning();

    return deleted;
  }

  async deleteMenuSections(menuId: string, ids: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(menuSection)
          .where(and(eq(menuSection.menuId, menuId), eq(menuSection.id, id)))
          .returning({ id: menuSection.id });
        if (!deleted.length) throw new NotFoundException();
      }
    });
  }

  // ── MenuItem ──────────────────────────────────────────────────────

  async createMenuItem(
    sectionId: string,
    organizationId: string,
    data: CreateMenuItemDto,
  ): Promise<MenuItemWithRecipe> {
    const { offer: offerData, ...itemData } = data;

    const section = await this.db.query.menuSection.findFirst({
      where: eq(menuSection.id, sectionId),
      columns: { menuId: true },
      with: { menu: { columns: { organizationId: true } } },
    });
    if (!section) throw notFoundError('menuSectionNotFound');

    const result = await this.db.transaction(async (tx) => {
      await this.validateOrderTicketPrinter(
        tx,
        section.menuId,
        itemData.orderTicketPrinterId,
      );

      await tx
        .update(menuItem)
        .set({ sortOrder: sql`${menuItem.sortOrder} + 1` })
        .where(eq(menuItem.menuSectionId, sectionId));

      const [created] = await tx
        .insert(menuItem)
        .values({
          id: uuidv4(),
          menuSectionId: sectionId,
          menuId: section.menuId,
          sortOrder: 0,
          ...itemData,
          ...resolveDrinkOptions(NEW_MENU_ITEM_DRINK_OPTIONS, itemData),
        })
        .returning();

      const boundRecipe = section.menu
        ? await bindRecipeByMenuItemName(tx, {
            menuItemId: created.id,
            name: created.name,
            organizationId: section.menu.organizationId,
          })
        : null;

      if (!offerData) return { ...created, offer: null, recipe: boundRecipe };

      const [createdOffer] = await tx
        .insert(offer)
        .values({ id: uuidv4(), menuItemId: created.id, ...offerData })
        .returning();

      return { ...created, offer: createdOffer, recipe: boundRecipe };
    });

    const [priceCurrency, recipeResult] = await Promise.all([
      getOrganizationCurrency(this.db, organizationId),
      this.recipeWithCost(result.recipe),
    ]);

    return {
      ...result,
      offer: withCurrency(result.offer, priceCurrency),
      recipe: recipeResult,
    };
  }

  async menuItem(
    where: { id: string },
    organizationId: string,
    canReadPurchasing = true,
  ): Promise<MenuItemWithRecipe | null> {
    const [result, existingOffers, recipes, priceCurrency] = await Promise.all([
      this.db.query.menuItem.findFirst({
        where: eq(menuItem.id, where.id),
      }),
      this.db
        .select()
        .from(offer)
        .where(eq(offer.menuItemId, where.id))
        .orderBy(asc(offer.createdAt))
        .limit(1),
      this.db
        .select({
          id: recipe.id,
          name: recipe.name,
          recipeYield: recipe.recipeYield,
        })
        .from(recipe)
        .where(eq(recipe.menuItemId, where.id))
        .limit(1),
      getOrganizationCurrency(this.db, organizationId),
    ]);
    if (!result) return null;

    return {
      ...result,
      offer: withCurrency(existingOffers[0], priceCurrency),
      recipe: await this.recipeWithCost(recipes[0], canReadPurchasing),
    };
  }

  async menuSectionItems(
    sectionId: string,
    organizationId: string,
    query: MenuItemPaginationQueryDto = {},
    canReadPurchasing = true,
  ): Promise<{ data: MenuItemWithRecipe[]; total: number }> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      searchField,
      searchOperator,
      searchValue,
      sortBy,
      sortDirection = 'desc',
    } = query;

    const offerValue = (column: Column | SQL): SQL =>
      sql`(select ${column} from ${offer} where ${offer.menuItemId} = ${menuItem.id} order by ${offer.createdAt} asc limit 1)`;

    const localizedFields: Record<string, Column | SQL> = {
      name: menuItem.name,
      description: menuItem.description,
      recipe: sql`(select ${recipe.name} from ${recipe} where ${recipe.menuItemId} = ${menuItem.id})`,
    };

    const itemFieldMap: Record<string, Column | SQL> = {
      price: offerValue(sql`${offer.price}::numeric`),
      availability: offerValue(sql`${offer.availability}::text`),
      availableModes: menuItem.availableModes,
      servingTemperatures: menuItem.servingTemperatures,
      sweetness: sql`${menuItem.sweetness}::text`,
      inventoryLevel: offerValue(
        sql`NULLIF(${offer.inventoryLevel}->>'value', '')::numeric`,
      ),
      deliveryLeadTimeMinutes: offerValue(offer.deliveryLeadTimeMinutes),
      priceSpecification: offerValue(
        sql`NULLIF(${offer.priceSpecification}->>'price', '')::numeric`,
      ),
      priceSpecificationValidFrom: offerValue(
        sql`NULLIF(${offer.priceSpecification}->>'validFrom', '')::date`,
      ),
      priceSpecificationValidThrough: offerValue(
        sql`NULLIF(${offer.priceSpecification}->>'validThrough', '')::date`,
      ),
      createdAt: menuItem.createdAt,
      updatedAt: menuItem.updatedAt,
    };

    const lang = toLanguage(I18nContext.current()?.lang);
    const sortColumn =
      sortBy === 'recipe'
        ? sql`(select ${localizedTextSql(recipe.name, lang)} from ${recipe} where ${recipe.menuItemId} = ${menuItem.id})`
        : sortBy && localizedFields[sortBy]
          ? localizedTextSql(localizedFields[sortBy], lang)
          : sortBy && itemFieldMap[sortBy];

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] = sortColumn
      ? [dir(sortColumn)]
      : [asc(menuItem.sortOrder), asc(menuItem.id)];

    const where = and(
      eq(menuItem.menuSectionId, sectionId),
      filterField && filterOperator && localizedFields[filterField]
        ? buildLocalizedTextFilterCondition(
            localizedFields[filterField],
            filterOperator,
            filterValue,
          )
        : filterField && filterOperator
          ? buildFilterCondition(
              filterField,
              filterOperator,
              filterValue,
              itemFieldMap,
              MENU_ITEM_STRING_FILTER_FIELDS,
              MENU_ITEM_DATE_FILTER_FIELDS,
              MENU_ITEM_ENUM_FILTER_FIELDS,
              MENU_ITEM_NUMBER_FILTER_FIELDS,
              MENU_ITEM_PLAIN_DATE_FILTER_FIELDS,
              MENU_ITEM_ARRAY_ENUM_FILTER_FIELDS,
            )
          : undefined,
      buildQuickFilterCondition({
        customConditions: {
          availableModes: (value) =>
            buildArrayOverlapCondition(menuItem.availableModes, value),
          servingTemperatures: (value) =>
            buildArrayOverlapCondition(menuItem.servingTemperatures, value),
        },
        enumFields: MENU_ITEM_QUICK_FILTER_ENUM_FIELDS,
        fieldMap: itemFieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ...Object.values(localizedFields).map((column) =>
            buildLocalizedTextFilterCondition(column, 'contains', value),
          ),
          ilike(
            offerValue(
              sql`concat_ws(' ', ${offer.price}::text, ${offer.inventoryLevel}->>'value', ${offer.inventoryLevel}->>'unitText', ${offer.deliveryLeadTimeMinutes}::text, ${offer.priceSpecification}->>'price', ${offer.priceSpecification}->>'validFrom', ${offer.priceSpecification}->>'validThrough')`,
            ),
            `%${value}%`,
          ),
          ilike(localTimeText(menuItem.createdAt), `%${value}%`),
          ilike(localTimeText(menuItem.updatedAt), `%${value}%`),
        ],
      }),
      searchField && searchOperator && searchValue
        ? buildLocalizedTextFilterCondition(
            localizedFields[searchField],
            searchOperator,
            searchValue,
          )
        : undefined,
    );

    const [data, [{ total }], priceCurrency] = await Promise.all([
      this.db
        .select()
        .from(menuItem)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(menuItem).where(where),
      getOrganizationCurrency(this.db, organizationId),
    ]);

    const itemIds = data.map((item) => item.id);
    const [offers, recipes] =
      itemIds.length > 0
        ? await Promise.all([
            this.db
              .select()
              .from(offer)
              .where(inArray(offer.menuItemId, itemIds))
              .orderBy(asc(offer.createdAt)),
            this.db
              .select({
                id: recipe.id,
                menuItemId: recipe.menuItemId,
                name: recipe.name,
                recipeYield: recipe.recipeYield,
              })
              .from(recipe)
              .where(inArray(recipe.menuItemId, itemIds)),
          ])
        : [[], []];

    const offerByItemId = new Map<string, Offer>();
    for (const o of offers) {
      if (o.menuItemId && !offerByItemId.has(o.menuItemId)) {
        offerByItemId.set(o.menuItemId, o);
      }
    }

    const costs = await this.recipesService.costsOf(
      recipes.map(({ id }) => id),
      canReadPurchasing,
    );
    const recipeByItemId = new Map<
      string,
      RecipeSummary & { cost?: number | null }
    >(
      recipes.flatMap(({ menuItemId, ...row }) =>
        menuItemId
          ? [
              [
                menuItemId,
                canReadPurchasing
                  ? { ...row, cost: costs.get(row.id) ?? null }
                  : row,
              ] as const,
            ]
          : [],
      ),
    );

    return {
      data: data.map((item) => ({
        ...item,
        offer: withCurrency(offerByItemId.get(item.id), priceCurrency),
        recipe: recipeByItemId.get(item.id) ?? null,
      })),
      total,
    };
  }

  async reorderMenuItems(
    sectionId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(menuItem)
          .set({ sortOrder: offset + i })
          .where(
            and(eq(menuItem.id, id), eq(menuItem.menuSectionId, sectionId)),
          );
      }
    });
  }

  async updateMenuItem(params: {
    where: { id: string };
    organizationId: string;
    data: UpdateMenuItemDto;
  }): Promise<MenuItemWithRecipe> {
    const { offer: offerData, ...itemData } = params.data;

    const touchesDrinkOptions = DRINK_OPTION_FIELDS.some(
      (field) => itemData[field] !== undefined,
    );

    const result = await this.db.transaction(async (tx) => {
      if (itemData.orderTicketPrinterId) {
        const [current] = await tx
          .select({ menuId: menuItem.menuId })
          .from(menuItem)
          .where(eq(menuItem.id, params.where.id));
        if (!current) throw notFoundError('menuItemNotFound');

        await this.validateOrderTicketPrinter(
          tx,
          current.menuId,
          itemData.orderTicketPrinterId,
        );
      }

      const [previous] =
        itemData.name || touchesDrinkOptions
          ? await tx
              .select({
                name: menuItem.name,
                servingTemperatures: menuItem.servingTemperatures,
                recommendedServingTemperatureLevel:
                  menuItem.recommendedServingTemperatureLevel,
                sweetness: menuItem.sweetness,
                fixedSweetnessLevel: menuItem.fixedSweetnessLevel,
                recommendedSweetnessLevel: menuItem.recommendedSweetnessLevel,
              })
              .from(menuItem)
              .where(eq(menuItem.id, params.where.id))
              .for('update')
          : [];

      const [[updated], existingOffers] = await Promise.all([
        tx
          .update(menuItem)
          .set({
            ...itemData,
            ...(touchesDrinkOptions &&
              previous &&
              resolveDrinkOptions(previous, itemData)),
            updatedAt: new Date(),
          })
          .where(eq(menuItem.id, params.where.id))
          .returning(),
        tx
          .select()
          .from(offer)
          .where(eq(offer.menuItemId, params.where.id))
          .orderBy(asc(offer.createdAt))
          .limit(1),
      ]);
      if (!updated) throw notFoundError('menuItemNotFound');

      const renamed =
        !!itemData.name &&
        !!previous &&
        !isSameLocalizedText(previous.name, updated.name);

      if (renamed) {
        await tx
          .update(recipe)
          .set({ name: updated.name, updatedAt: new Date() })
          .where(eq(recipe.menuItemId, updated.id));

        if (updated.menuId) {
          const [row] = await tx
            .select({ organizationId: menu.organizationId })
            .from(menu)
            .where(eq(menu.id, updated.menuId));

          if (row)
            await bindRecipeByMenuItemName(tx, {
              menuItemId: updated.id,
              name: updated.name,
              organizationId: row.organizationId,
            });
        }
      }

      const [boundRecipe] = await tx
        .select({
          id: recipe.id,
          name: recipe.name,
          recipeYield: recipe.recipeYield,
        })
        .from(recipe)
        .where(eq(recipe.menuItemId, updated.id))
        .limit(1);

      if (!offerData)
        return {
          ...updated,
          offer: existingOffers[0] ?? null,
          recipe: boundRecipe ?? null,
        };

      const existingOffer = existingOffers[0];
      let resultOffer: Offer;

      if (existingOffer) {
        const [updatedOffer] = await tx
          .update(offer)
          .set({
            ...offerData,
            ...keepAutoSoldOut(offerData.availability),
            updatedAt: new Date(),
          })
          .where(eq(offer.id, existingOffer.id))
          .returning();
        resultOffer = updatedOffer;
      } else {
        const [createdOffer] = await tx
          .insert(offer)
          .values({ id: uuidv4(), menuItemId: params.where.id, ...offerData })
          .returning();
        resultOffer = createdOffer;
      }

      return { ...updated, offer: resultOffer, recipe: boundRecipe ?? null };
    });

    const [priceCurrency, recipeResult] = await Promise.all([
      getOrganizationCurrency(this.db, params.organizationId),
      this.recipeWithCost(result.recipe),
    ]);

    return {
      ...result,
      offer: withCurrency(result.offer, priceCurrency),
      recipe: recipeResult,
    };
  }

  async deleteMenuItem(where: {
    id: string;
  }): Promise<MenuItem & { offer: OfferWithCurrency | null }> {
    const [deleted] = await this.db
      .delete(menuItem)
      .where(eq(menuItem.id, where.id))
      .returning();

    return { ...deleted, offer: null };
  }

  async deleteMenuItems(sectionId: string, ids: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(menuItem)
          .where(
            and(eq(menuItem.menuSectionId, sectionId), eq(menuItem.id, id)),
          )
          .returning({ id: menuItem.id });
        if (!deleted.length) throw new NotFoundException();
      }
    });
  }

  // ── Offer ─────────────────────────────────────────────────────────

  async createOffer(
    menuItemId: string,
    organizationId: string,
    data: CreateOfferDto,
  ): Promise<OfferWithCurrency> {
    const [created] = await this.db
      .insert(offer)
      .values({ id: uuidv4(), menuItemId, ...data })
      .returning();

    return {
      ...created,
      priceCurrency: await getOrganizationCurrency(this.db, organizationId),
    };
  }

  async menuItemOffers(
    menuItemId: string,
    organizationId: string,
  ): Promise<OfferWithCurrency[]> {
    const [rows, priceCurrency] = await Promise.all([
      this.db
        .select()
        .from(offer)
        .where(eq(offer.menuItemId, menuItemId))
        .orderBy(asc(offer.createdAt)),
      getOrganizationCurrency(this.db, organizationId),
    ]);

    return rows.map((row) => ({ ...row, priceCurrency }));
  }

  async updateOffer(params: {
    where: { id: string };
    organizationId: string;
    data: UpdateOfferDto;
  }): Promise<OfferWithCurrency> {
    const [updated] = await this.db
      .update(offer)
      .set({
        ...params.data,
        ...keepAutoSoldOut(params.data.availability),
        updatedAt: new Date(),
      })
      .where(eq(offer.id, params.where.id))
      .returning();
    if (!updated) throw notFoundError('offerNotFound');

    return {
      ...updated,
      priceCurrency: await getOrganizationCurrency(
        this.db,
        params.organizationId,
      ),
    };
  }

  async updateOfferAvailability(params: {
    where: { id: string };
    organizationId: string;
    data: UpdateOfferAvailabilityDto;
  }): Promise<OfferWithCurrency> {
    const { inventoryLevel, ...availability } = params.data;

    let nextInventoryLevel: QuantitativeValue | null | undefined;
    if (inventoryLevel) {
      const [current] = await this.db
        .select({ inventoryLevel: offer.inventoryLevel })
        .from(offer)
        .where(eq(offer.id, params.where.id));
      if (!current) throw notFoundError('offerNotFound');

      // 單位屬菜單定義，itemAvailability 權限改不得，因此併回既有值而非整包覆寫
      const unitText = current.inventoryLevel?.unitText;
      nextInventoryLevel =
        inventoryLevel.value == null && !unitText
          ? null
          : {
              ...(unitText && { unitText }),
              ...(inventoryLevel.value != null && {
                value: inventoryLevel.value,
              }),
            };
    }

    const [updated] = await this.db
      .update(offer)
      .set({
        ...availability,
        ...keepAutoSoldOut(availability.availability),
        ...(nextInventoryLevel !== undefined && {
          inventoryLevel: nextInventoryLevel,
        }),
        updatedAt: new Date(),
      })
      .where(eq(offer.id, params.where.id))
      .returning();

    return {
      ...updated,
      priceCurrency: await getOrganizationCurrency(
        this.db,
        params.organizationId,
      ),
    };
  }

  async deleteOffer(where: {
    id: string;
    organizationId: string;
  }): Promise<OfferWithCurrency> {
    const [deleted] = await this.db
      .delete(offer)
      .where(eq(offer.id, where.id))
      .returning();
    if (!deleted) throw notFoundError('offerNotFound');

    return {
      ...deleted,
      priceCurrency: await getOrganizationCurrency(
        this.db,
        where.organizationId,
      ),
    };
  }

  // ── MenuItemAddOn ─────────────────────────────────────────────────

  private menuItemAddOnWithNames() {
    const addOnMenuItem = alias(menuItem, 'add_on_menu_item');
    const addOnMenuSection = alias(menuSection, 'add_on_menu_section');
    const addOnMenuItemSection = alias(menuSection, 'add_on_menu_item_section');

    return { addOnMenuItem, addOnMenuSection, addOnMenuItemSection };
  }

  private async findMenuItemAddOnById(id: string): Promise<
    MenuItemAddOn & {
      addOnMenuItemName: LocalizedText | null;
      addOnMenuSectionName: LocalizedText | null;
      addOnMenuItemSectionId: string | null;
      addOnMenuItemSectionName: LocalizedText | null;
    }
  > {
    const { addOnMenuItem, addOnMenuSection, addOnMenuItemSection } =
      this.menuItemAddOnWithNames();
    const [row] = await this.db
      .select({
        ...getTableColumns(menuItemAddOn),
        addOnMenuItemName: addOnMenuItem.name,
        addOnMenuSectionName: addOnMenuSection.name,
        addOnMenuItemSectionId: addOnMenuItemSection.id,
        addOnMenuItemSectionName: addOnMenuItemSection.name,
      })
      .from(menuItemAddOn)
      .leftJoin(
        addOnMenuItem,
        eq(menuItemAddOn.addOnMenuItemId, addOnMenuItem.id),
      )
      .leftJoin(
        addOnMenuSection,
        eq(menuItemAddOn.addOnMenuSectionId, addOnMenuSection.id),
      )
      .leftJoin(
        addOnMenuItemSection,
        eq(addOnMenuItem.menuSectionId, addOnMenuItemSection.id),
      )
      .where(eq(menuItemAddOn.id, id));

    return row;
  }

  private async menuIdOfItem(menuItemId: string): Promise<string> {
    const [row] = await this.db
      .select({ menuId: menuItem.menuId })
      .from(menuItem)
      .where(eq(menuItem.id, menuItemId));
    if (!row) throw notFoundError('menuItemNotFound');

    return row.menuId;
  }

  private async validateAddOnTargets(
    menuItemId: string,
    {
      addOnMenuItemId,
      addOnMenuSectionId,
    }: CreateMenuItemAddOnDto | UpdateMenuItemAddOnDto,
  ): Promise<void> {
    if (!addOnMenuItemId === !addOnMenuSectionId)
      throw new BadRequestException(this.t('addOnTargetRequired'));

    if (addOnMenuItemId === menuItemId) {
      throw new BadRequestException(this.t('addOnSelf'));
    }

    const menuId = await this.menuIdOfItem(menuItemId);

    if (
      addOnMenuItemId &&
      (await this.menuIdOfItem(addOnMenuItemId)) !== menuId
    )
      throw notFoundError('menuItemNotFound');

    if (addOnMenuSectionId) {
      const [target] = await this.db
        .select({ id: menuSection.id })
        .from(menuSection)
        .where(
          and(
            eq(menuSection.id, addOnMenuSectionId),
            eq(menuSection.menuId, menuId),
          ),
        );
      if (!target) throw notFoundError('addOnMenuSectionNotFound');
    }
  }

  async createMenuItemAddOn(
    menuItemId: string,
    data: CreateMenuItemAddOnDto,
  ): Promise<
    MenuItemAddOn & {
      addOnMenuItemName: LocalizedText | null;
      addOnMenuSectionName: LocalizedText | null;
      addOnMenuItemSectionId: string | null;
      addOnMenuItemSectionName: LocalizedText | null;
    }
  > {
    await this.validateAddOnTargets(menuItemId, data);

    const created = await this.db.transaction(async (tx) => {
      await tx
        .update(menuItemAddOn)
        .set({ sortOrder: sql`${menuItemAddOn.sortOrder} + 1` })
        .where(eq(menuItemAddOn.menuItemId, menuItemId));

      const [row] = await tx
        .insert(menuItemAddOn)
        .values({ id: uuidv4(), menuItemId, sortOrder: 0, ...data })
        .returning();

      return row;
    });

    return this.findMenuItemAddOnById(created.id);
  }

  async menuItemAddOns(
    menuItemId: string,
    query: AddOnPaginationQueryDto = {},
  ): Promise<{
    data: (MenuItemAddOn & {
      addOnMenuItemName: LocalizedText | null;
      addOnMenuSectionName: LocalizedText | null;
      addOnMenuItemSectionId: string | null;
      addOnMenuItemSectionName: LocalizedText | null;
    })[];
    total: number;
  }> {
    const { addOnMenuItem, addOnMenuSection, addOnMenuItemSection } =
      this.menuItemAddOnWithNames();

    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterValue,
      sortBy,
      sortDirection = 'asc',
    } = query;

    const localizedFields: Record<string, Column | SQL> = {
      addOnMenuSectionName: sql`COALESCE(${addOnMenuSection.name}, ${addOnMenuItemSection.name})`,
      addOnMenuItemName: addOnMenuItem.name,
    };

    const addOnFieldMap: Record<string, SQL> = {
      createdAt: sql`${menuItemAddOn.createdAt}`,
      updatedAt: sql`${menuItemAddOn.updatedAt}`,
    };

    const filterCondition =
      filterField && filterOperator && localizedFields[filterField]
        ? buildLocalizedTextFilterCondition(
            localizedFields[filterField],
            filterOperator,
            filterValue,
          )
        : filterField && filterOperator
          ? buildFilterCondition(
              filterField,
              filterOperator,
              filterValue,
              addOnFieldMap,
              ADD_ON_STRING_FILTER_FIELDS,
              ADD_ON_DATE_FILTER_FIELDS,
            )
          : undefined;

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] =
      sortBy && localizedFields[sortBy]
        ? [
            dir(
              localizedTextSql(
                localizedFields[sortBy],
                toLanguage(I18nContext.current()?.lang),
              ),
            ),
          ]
        : sortBy && addOnFieldMap[sortBy]
          ? [dir(addOnFieldMap[sortBy])]
          : [asc(menuItemAddOn.sortOrder), asc(menuItemAddOn.id)];

    const where = and(
      eq(menuItemAddOn.menuItemId, menuItemId),
      filterCondition,
      quickFilterValue
        ? or(
            ...Object.values(localizedFields).map((column) =>
              buildLocalizedTextFilterCondition(
                column,
                'contains',
                quickFilterValue,
              ),
            ),
            ilike(
              localTimeText(menuItemAddOn.createdAt),
              `%${quickFilterValue}%`,
            ),
            ilike(
              localTimeText(menuItemAddOn.updatedAt),
              `%${quickFilterValue}%`,
            ),
          )
        : undefined,
    );

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(menuItemAddOn),
          addOnMenuItemName: addOnMenuItem.name,
          addOnMenuSectionName: addOnMenuSection.name,
          addOnMenuItemSectionId: addOnMenuItemSection.id,
          addOnMenuItemSectionName: addOnMenuItemSection.name,
        })
        .from(menuItemAddOn)
        .leftJoin(
          addOnMenuItem,
          eq(menuItemAddOn.addOnMenuItemId, addOnMenuItem.id),
        )
        .leftJoin(
          addOnMenuSection,
          eq(menuItemAddOn.addOnMenuSectionId, addOnMenuSection.id),
        )
        .leftJoin(
          addOnMenuItemSection,
          eq(addOnMenuItem.menuSectionId, addOnMenuItemSection.id),
        )
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(menuItemAddOn)
        .leftJoin(
          addOnMenuItem,
          eq(menuItemAddOn.addOnMenuItemId, addOnMenuItem.id),
        )
        .leftJoin(
          addOnMenuSection,
          eq(menuItemAddOn.addOnMenuSectionId, addOnMenuSection.id),
        )
        .leftJoin(
          addOnMenuItemSection,
          eq(addOnMenuItem.menuSectionId, addOnMenuItemSection.id),
        )
        .where(where),
    ]);

    return { data, total };
  }

  async reorderMenuItemAddOns(
    menuItemId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(menuItemAddOn)
          .set({ sortOrder: offset + i })
          .where(
            and(
              eq(menuItemAddOn.id, id),
              eq(menuItemAddOn.menuItemId, menuItemId),
            ),
          );
      }
    });
  }

  async updateMenuItemAddOn(
    where: { id: string; menuItemId: string },
    data: UpdateMenuItemAddOnDto,
  ): Promise<
    MenuItemAddOn & {
      addOnMenuItemName: LocalizedText | null;
      addOnMenuSectionName: LocalizedText | null;
      addOnMenuItemSectionId: string | null;
      addOnMenuItemSectionName: LocalizedText | null;
    }
  > {
    const found = await this.findMenuItemAddOnById(where.id);
    if (found.menuItemId !== where.menuItemId) throw new NotFoundException();
    await this.validateAddOnTargets(where.menuItemId, {
      addOnMenuItemId:
        data.addOnMenuItemId === undefined
          ? found.addOnMenuItemId
          : data.addOnMenuItemId,
      addOnMenuSectionId:
        data.addOnMenuSectionId === undefined
          ? found.addOnMenuSectionId
          : data.addOnMenuSectionId,
    });

    await this.db
      .update(menuItemAddOn)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(menuItemAddOn.id, where.id));

    return this.findMenuItemAddOnById(where.id);
  }

  async deleteMenuItemAddOn(where: { id: string; menuItemId: string }): Promise<
    MenuItemAddOn & {
      addOnMenuItemName: LocalizedText | null;
      addOnMenuSectionName: LocalizedText | null;
      addOnMenuItemSectionId: string | null;
      addOnMenuItemSectionName: LocalizedText | null;
    }
  > {
    const found = await this.findMenuItemAddOnById(where.id);
    if (found.menuItemId !== where.menuItemId) throw new NotFoundException();
    await this.db.delete(menuItemAddOn).where(eq(menuItemAddOn.id, where.id));

    return found;
  }

  async deleteMenuItemAddOns(menuItemId: string, ids: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(menuItemAddOn)
          .where(
            and(
              eq(menuItemAddOn.menuItemId, menuItemId),
              eq(menuItemAddOn.id, id),
            ),
          )
          .returning({ id: menuItemAddOn.id });
        if (!deleted.length) throw new NotFoundException();
      }
    });
  }

  // ── ModifierGroup ─────────────────────────────────────────────────

  private validateSelectionCounts(
    minSelectionCount: number,
    maxSelectionCount: number | null,
  ): void {
    if (maxSelectionCount !== null && maxSelectionCount < minSelectionCount) {
      throw new BadRequestException(this.t('selectionCountInvalid'));
    }
  }

  async createModifierGroup(
    menuId: string,
    data: CreateModifierGroupDto,
  ): Promise<ModifierGroup> {
    const { minSelectionCount, maxSelectionCount } = data;

    this.validateSelectionCounts(
      minSelectionCount || 0,
      maxSelectionCount || null,
    );

    return this.db.transaction(async (tx) => {
      await tx
        .update(modifierGroup)
        .set({ sortOrder: sql`${modifierGroup.sortOrder} + 1` })
        .where(eq(modifierGroup.menuId, menuId));

      const [created] = await tx
        .insert(modifierGroup)
        .values({ id: uuidv4(), menuId, sortOrder: 0, ...data })
        .returning();

      return created;
    });
  }

  async modifierGroups(
    menuId: string,
    query: ModifierGroupPaginationQueryDto = {},
  ): Promise<{ data: ModifierGroup[]; total: number }> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterValue,
      sortBy,
      sortDirection = 'asc',
    } = query;

    const fieldMap: Record<string, Column | SQL> = {
      minSelectionCount: modifierGroup.minSelectionCount,
      maxSelectionCount: modifierGroup.maxSelectionCount,
      createdAt: modifierGroup.createdAt,
      updatedAt: modifierGroup.updatedAt,
    };

    const filterCondition =
      filterField === 'displayName' && filterOperator
        ? buildLocalizedTextFilterCondition(
            modifierGroup.displayName,
            filterOperator,
            filterValue,
          )
        : filterField && filterOperator
          ? buildFilterCondition(
              filterField,
              filterOperator,
              filterValue,
              fieldMap,
              MODIFIER_GROUP_STRING_FILTER_FIELDS,
              MODIFIER_GROUP_DATE_FILTER_FIELDS,
              [],
              MODIFIER_GROUP_NUMBER_FILTER_FIELDS,
            )
          : undefined;

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] =
      sortBy === 'displayName'
        ? [
            dir(
              localizedTextSql(
                modifierGroup.displayName,
                toLanguage(I18nContext.current()?.lang),
              ),
            ),
          ]
        : sortBy && fieldMap[sortBy]
          ? [dir(fieldMap[sortBy])]
          : [asc(modifierGroup.sortOrder), asc(modifierGroup.id)];

    const where = and(
      eq(modifierGroup.menuId, menuId),
      filterCondition,
      quickFilterValue
        ? or(
            buildLocalizedTextFilterCondition(
              modifierGroup.displayName,
              'contains',
              quickFilterValue,
            ),
            ilike(
              sql`${modifierGroup.minSelectionCount}::text`,
              `%${quickFilterValue}%`,
            ),
            ilike(
              sql`${modifierGroup.maxSelectionCount}::text`,
              `%${quickFilterValue}%`,
            ),
            ilike(
              localTimeText(modifierGroup.createdAt),
              `%${quickFilterValue}%`,
            ),
            ilike(
              localTimeText(modifierGroup.updatedAt),
              `%${quickFilterValue}%`,
            ),
          )
        : undefined,
    );

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(modifierGroup)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(modifierGroup).where(where),
    ]);

    return { data, total };
  }

  async reorderModifierGroups(
    menuId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(modifierGroup)
          .set({ sortOrder: offset + i })
          .where(
            and(eq(modifierGroup.id, id), eq(modifierGroup.menuId, menuId)),
          );
      }
    });
  }

  async modifierGroup(where: { id: string }): Promise<ModifierGroup | null> {
    const result = await this.db.query.modifierGroup.findFirst({
      where: eq(modifierGroup.id, where.id),
    });

    return result || null;
  }

  async updateModifierGroup(params: {
    where: { id: string };
    data: UpdateModifierGroupDto;
  }): Promise<ModifierGroup> {
    const { minSelectionCount, maxSelectionCount } = params.data;

    if (minSelectionCount !== undefined || maxSelectionCount !== undefined) {
      const existing = await this.modifierGroup({ id: params.where.id });

      if (existing) {
        this.validateSelectionCounts(
          minSelectionCount ?? existing.minSelectionCount,
          maxSelectionCount === undefined
            ? existing.maxSelectionCount
            : maxSelectionCount,
        );
      }
    }

    const [updated] = await this.db
      .update(modifierGroup)
      .set({ ...params.data, updatedAt: new Date() })
      .where(eq(modifierGroup.id, params.where.id))
      .returning();

    return updated;
  }

  async deleteModifierGroup(where: { id: string }): Promise<ModifierGroup> {
    const [deleted] = await this.db
      .delete(modifierGroup)
      .where(eq(modifierGroup.id, where.id))
      .returning();

    return deleted;
  }

  async deleteModifierGroups(menuId: string, ids: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(modifierGroup)
          .where(
            and(eq(modifierGroup.menuId, menuId), eq(modifierGroup.id, id)),
          )
          .returning({ id: modifierGroup.id });
        if (!deleted.length) throw new NotFoundException();
      }
    });
  }

  // ── Modifier ──────────────────────────────────────────────────────

  async createModifier(
    modifierGroupId: string,
    organizationId: string,
    data: CreateModifierDto,
  ): Promise<ModifierWithCurrency> {
    const created = await this.db.transaction(async (tx) => {
      await tx
        .update(modifier)
        .set({ sortOrder: sql`${modifier.sortOrder} + 1` })
        .where(eq(modifier.modifierGroupId, modifierGroupId));

      const [row] = await tx
        .insert(modifier)
        .values({ id: uuidv4(), modifierGroupId, sortOrder: 0, ...data })
        .returning();

      return row;
    });

    return {
      ...created,
      priceCurrency: await getOrganizationCurrency(this.db, organizationId),
    };
  }

  async modifiers(
    modifierGroupId: string,
    organizationId: string,
    query: ModifierPaginationQueryDto = {},
  ): Promise<{ data: ModifierWithCurrency[]; total: number }> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      sortBy,
      sortDirection = 'asc',
    } = query;

    const fieldMap: Record<string, Column | SQL> = {
      priceAdjustment: modifier.priceAdjustment,
      availability: sql`${modifier.availability}::text`,
      availableModes: modifier.availableModes,
      createdAt: modifier.createdAt,
      updatedAt: modifier.updatedAt,
    };

    const filterCondition =
      filterField === 'displayName' && filterOperator
        ? buildLocalizedTextFilterCondition(
            modifier.displayName,
            filterOperator,
            filterValue,
          )
        : filterField && filterOperator
          ? buildFilterCondition(
              filterField,
              filterOperator,
              filterValue,
              fieldMap,
              MODIFIER_STRING_FILTER_FIELDS,
              MODIFIER_DATE_FILTER_FIELDS,
              MODIFIER_ENUM_FILTER_FIELDS,
              MODIFIER_NUMBER_FILTER_FIELDS,
              [],
              MODIFIER_ARRAY_ENUM_FILTER_FIELDS,
            )
          : undefined;

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] =
      sortBy === 'displayName'
        ? [
            dir(
              localizedTextSql(
                modifier.displayName,
                toLanguage(I18nContext.current()?.lang),
              ),
            ),
          ]
        : sortBy && fieldMap[sortBy]
          ? [dir(fieldMap[sortBy])]
          : [asc(modifier.sortOrder), asc(modifier.id)];

    const where = and(
      eq(modifier.modifierGroupId, modifierGroupId),
      filterCondition,
      buildQuickFilterCondition({
        customConditions: {
          availableModes: (value) =>
            buildArrayOverlapCondition(modifier.availableModes, value),
        },
        enumFields: MODIFIER_QUICK_FILTER_ENUM_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          buildLocalizedTextFilterCondition(
            modifier.displayName,
            'contains',
            value,
          ),
          ilike(sql`${modifier.priceAdjustment}::text`, `%${value}%`),
          ilike(localTimeText(modifier.createdAt), `%${value}%`),
          ilike(localTimeText(modifier.updatedAt), `%${value}%`),
        ],
      }),
    );

    const [data, [{ total }], priceCurrency] = await Promise.all([
      this.db
        .select()
        .from(modifier)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(modifier).where(where),
      getOrganizationCurrency(this.db, organizationId),
    ]);

    return {
      data: data.map((row) => ({ ...row, priceCurrency })),
      total,
    };
  }

  async reorderModifiers(
    modifierGroupId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(modifier)
          .set({ sortOrder: offset + i })
          .where(
            and(
              eq(modifier.id, id),
              eq(modifier.modifierGroupId, modifierGroupId),
            ),
          );
      }
    });
  }

  async updateModifier(params: {
    where: { id: string };
    organizationId: string;
    data: UpdateModifierDto;
  }): Promise<ModifierWithCurrency> {
    const [updated] = await this.db
      .update(modifier)
      .set({ ...params.data, updatedAt: new Date() })
      .where(eq(modifier.id, params.where.id))
      .returning();
    if (!updated) throw notFoundError('modifierNotFound');

    return {
      ...updated,
      priceCurrency: await getOrganizationCurrency(
        this.db,
        params.organizationId,
      ),
    };
  }

  async deleteModifier(where: {
    id: string;
    organizationId: string;
  }): Promise<ModifierWithCurrency> {
    const [deleted] = await this.db
      .delete(modifier)
      .where(eq(modifier.id, where.id))
      .returning();
    if (!deleted) throw notFoundError('modifierNotFound');

    return {
      ...deleted,
      priceCurrency: await getOrganizationCurrency(
        this.db,
        where.organizationId,
      ),
    };
  }

  async deleteModifiers(groupId: string, ids: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(modifier)
          .where(
            and(eq(modifier.modifierGroupId, groupId), eq(modifier.id, id)),
          )
          .returning({ id: modifier.id });
        if (!deleted.length) throw new NotFoundException();
      }
    });
  }

  // ── MenuItemModifierGroup ─────────────────────────────────────────

  async createMenuItemModifierGroup(
    menuItemId: string,
    data: CreateMenuItemModifierGroupDto,
  ): Promise<MenuItemModifierGroup> {
    const menuId = await this.menuIdOfItem(menuItemId);
    const [group] = await this.db
      .select({ id: modifierGroup.id })
      .from(modifierGroup)
      .where(
        and(
          eq(modifierGroup.id, data.modifierGroupId),
          eq(modifierGroup.menuId, menuId),
        ),
      );
    if (!group) throw notFoundError('modifierGroupNotFound');

    return this.db.transaction(async (tx) => {
      await tx
        .update(menuItemModifierGroup)
        .set({ sortOrder: sql`${menuItemModifierGroup.sortOrder} + 1` })
        .where(eq(menuItemModifierGroup.menuItemId, menuItemId));

      const [created] = await tx
        .insert(menuItemModifierGroup)
        .values({
          id: uuidv4(),
          menuItemId,
          modifierGroupId: data.modifierGroupId,
          sortOrder: 0,
        })
        .returning();

      return created;
    });
  }

  async menuItemModifierGroups(
    menuItemId: string,
    query: ModifierGroupPaginationQueryDto = {},
  ): Promise<{
    data: (MenuItemModifierGroup & { modifierGroup: ModifierGroup })[];
    total: number;
  }> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterValue,
      sortBy,
      sortDirection = 'asc',
    } = query;

    const fieldMap: Record<string, Column | SQL> = {
      minSelectionCount: modifierGroup.minSelectionCount,
      maxSelectionCount: modifierGroup.maxSelectionCount,
      createdAt: menuItemModifierGroup.createdAt,
      updatedAt: menuItemModifierGroup.updatedAt,
    };

    const filterCondition =
      filterField === 'displayName' && filterOperator
        ? buildLocalizedTextFilterCondition(
            modifierGroup.displayName,
            filterOperator,
            filterValue,
          )
        : filterField && filterOperator
          ? buildFilterCondition(
              filterField,
              filterOperator,
              filterValue,
              fieldMap,
              MODIFIER_GROUP_STRING_FILTER_FIELDS,
              MODIFIER_GROUP_DATE_FILTER_FIELDS,
              [],
              MODIFIER_GROUP_NUMBER_FILTER_FIELDS,
            )
          : undefined;

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] =
      sortBy === 'displayName'
        ? [
            dir(
              localizedTextSql(
                modifierGroup.displayName,
                toLanguage(I18nContext.current()?.lang),
              ),
            ),
          ]
        : sortBy && fieldMap[sortBy]
          ? [dir(fieldMap[sortBy])]
          : [
              asc(menuItemModifierGroup.sortOrder),
              asc(menuItemModifierGroup.id),
            ];

    const where = and(
      eq(menuItemModifierGroup.menuItemId, menuItemId),
      filterCondition,
      quickFilterValue
        ? or(
            buildLocalizedTextFilterCondition(
              modifierGroup.displayName,
              'contains',
              quickFilterValue,
            ),
            ilike(
              sql`${modifierGroup.minSelectionCount}::text`,
              `%${quickFilterValue}%`,
            ),
            ilike(
              sql`${modifierGroup.maxSelectionCount}::text`,
              `%${quickFilterValue}%`,
            ),
            ilike(
              localTimeText(menuItemModifierGroup.createdAt),
              `%${quickFilterValue}%`,
            ),
            ilike(
              localTimeText(menuItemModifierGroup.updatedAt),
              `%${quickFilterValue}%`,
            ),
          )
        : undefined,
    );

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: menuItemModifierGroup.id,
          menuItemId: menuItemModifierGroup.menuItemId,
          modifierGroupId: menuItemModifierGroup.modifierGroupId,
          sortOrder: menuItemModifierGroup.sortOrder,
          createdAt: menuItemModifierGroup.createdAt,
          updatedAt: menuItemModifierGroup.updatedAt,
          modifierGroup: {
            id: modifierGroup.id,
            menuId: modifierGroup.menuId,
            displayName: modifierGroup.displayName,
            minSelectionCount: modifierGroup.minSelectionCount,
            maxSelectionCount: modifierGroup.maxSelectionCount,
            sortOrder: modifierGroup.sortOrder,
            createdAt: modifierGroup.createdAt,
            updatedAt: modifierGroup.updatedAt,
          },
        })
        .from(menuItemModifierGroup)
        .innerJoin(
          modifierGroup,
          eq(menuItemModifierGroup.modifierGroupId, modifierGroup.id),
        )
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(menuItemModifierGroup)
        .innerJoin(
          modifierGroup,
          eq(menuItemModifierGroup.modifierGroupId, modifierGroup.id),
        )
        .where(where),
    ]);

    return { data, total };
  }

  async reorderMenuItemModifierGroups(
    menuItemId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(menuItemModifierGroup)
          .set({ sortOrder: offset + i })
          .where(
            and(
              eq(menuItemModifierGroup.id, id),
              eq(menuItemModifierGroup.menuItemId, menuItemId),
            ),
          );
      }
    });
  }

  async deleteMenuItemModifierGroup(where: {
    id: string;
    menuItemId: string;
  }): Promise<MenuItemModifierGroup> {
    const [deleted] = await this.db
      .delete(menuItemModifierGroup)
      .where(
        and(
          eq(menuItemModifierGroup.id, where.id),
          eq(menuItemModifierGroup.menuItemId, where.menuItemId),
        ),
      )
      .returning();
    if (!deleted) throw new NotFoundException();

    return deleted;
  }

  async deleteMenuItemModifierGroups(
    menuItemId: string,
    ids: string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(menuItemModifierGroup)
          .where(
            and(
              eq(menuItemModifierGroup.menuItemId, menuItemId),
              eq(menuItemModifierGroup.id, id),
            ),
          )
          .returning({ id: menuItemModifierGroup.id });
        if (!deleted.length) throw new NotFoundException();
      }
    });
  }
}
