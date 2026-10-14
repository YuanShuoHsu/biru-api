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
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { v4 as uuidv4 } from 'uuid';

import type { Transaction } from 'src/attendance/attendance-audit';
import { isSameLocalizedText } from 'src/common/utils/localized-text';
import { getOrganizationCurrency } from 'src/common/utils/organizations';
import type { LocalizedText } from 'src/db/schema/enums';
import { recipe } from 'src/db/schema/inventory';
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
} from 'src/db/schema/menus';
import {
  menu,
  menuItem,
  menuItemAddOn,
  menuItemModifierGroup,
  menuSection,
  modifier,
  modifierGroup,
  offer,
} from 'src/db/schema/menus';
import { startDeletedRecordBatch } from 'src/deleted-records/request-batch';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { bindRecipeByMenuItemName } from 'src/inventory/recipe-menu-item-binding';
import { RecipesService } from 'src/inventory/recipes.service';

import {
  buildArrayOverlapCondition,
  buildFilterCondition,
  buildQuickFilterCondition,
  buildStringFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';

import {
  ADD_ON_DATE_FILTER_FIELDS,
  ADD_ON_STRING_FILTER_FIELDS,
  type AddOnPaginationQueryDto,
} from './dto/add-on-pagination-query.dto';
import type { CreateMenuItemAddOnDto } from './dto/create-menu-item-add-on.dto';
import type { CreateMenuItemModifierGroupDto } from './dto/create-menu-item-modifier-group.dto';
import type { CreateMenuItemDto } from './dto/create-menu-item.dto';
import type { CreateMenuSectionDto } from './dto/create-menu-section.dto';
import type { CreateModifierGroupDto } from './dto/create-modifier-group.dto';
import type { CreateModifierDto } from './dto/create-modifier.dto';
import type { CreateOfferDto } from './dto/create-offer.dto';
import {
  MENU_ITEM_ARRAY_ENUM_FILTER_FIELDS,
  MENU_ITEM_DATE_FILTER_FIELDS,
  MENU_ITEM_ENUM_FILTER_FIELDS,
  MENU_ITEM_NUMBER_FILTER_FIELDS,
  MENU_ITEM_PLAIN_DATE_FILTER_FIELDS,
  MENU_ITEM_QUICK_FILTER_ENUM_FIELDS,
  MENU_ITEM_STRING_FILTER_FIELDS,
  MenuItemPaginationQueryDto,
} from './dto/menu-item-pagination-query.dto';
import {
  MENU_SECTION_DATE_FILTER_FIELDS,
  MENU_SECTION_STRING_FILTER_FIELDS,
  MenuSectionPaginationQueryDto,
} from './dto/menu-section-pagination-query.dto';
import {
  MODIFIER_GROUP_DATE_FILTER_FIELDS,
  MODIFIER_GROUP_NUMBER_FILTER_FIELDS,
  MODIFIER_GROUP_STRING_FILTER_FIELDS,
  type ModifierGroupPaginationQueryDto,
} from './dto/modifier-group-pagination-query.dto';
import {
  MODIFIER_ARRAY_ENUM_FILTER_FIELDS,
  MODIFIER_DATE_FILTER_FIELDS,
  MODIFIER_ENUM_FILTER_FIELDS,
  MODIFIER_NUMBER_FILTER_FIELDS,
  MODIFIER_QUICK_FILTER_ENUM_FIELDS,
  MODIFIER_STRING_FILTER_FIELDS,
  type ModifierPaginationQueryDto,
} from './dto/modifier-pagination-query.dto';
import type { UpdateMenuItemAddOnDto } from './dto/update-menu-item-add-on.dto';
import type { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import type { UpdateMenuSectionDto } from './dto/update-menu-section.dto';
import type { UpdateMenuDto } from './dto/update-menu.dto';
import type { UpdateModifierGroupDto } from './dto/update-modifier-group.dto';
import type { UpdateModifierDto } from './dto/update-modifier.dto';
import type { UpdateOfferAvailabilityDto } from './dto/update-offer-availability.dto';
import type { UpdateOfferDto } from './dto/update-offer.dto';

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

const withCurrency = (
  row: Offer | null | undefined,
  priceCurrency: string,
): OfferWithCurrency | null => (row ? { ...row, priceCurrency } : null);

@Injectable()
export class MenusService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly recipesService: RecipesService,
  ) {}

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
      throw new BadRequestException(
        'parentSectionId must not be the section itself',
      );

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
      throw new NotFoundException('Parent section not found');
    if (sectionId && ancestors.some(({ id }) => id === sectionId))
      throw new BadRequestException(
        'parentSectionId must not be a descendant of the section',
      );
  }

  async createMenuSection(
    menuId: string,
    data: CreateMenuSectionDto,
  ): Promise<MenuSection> {
    return this.db.transaction(async (tx) => {
      await this.validateParentSection(tx, menuId, data.parentSectionId);

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

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] = sortBy
      ? [dir(menuSection[sortBy])]
      : [asc(menuSection.sortOrder), asc(menuSection.id)];

    const sectionFieldMap: Record<string, Column | SQL> = {
      name: sql`${menuSection.name}::text`,
      description: sql`${menuSection.description}::text`,
      createdAt: menuSection.createdAt,
      updatedAt: menuSection.updatedAt,
    };

    const where = and(
      eq(menuSection.menuId, menuId),
      filterField && filterOperator
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
            ilike(sql`${menuSection.name}::text`, `%${quickFilterValue}%`),
            ilike(
              sql`${menuSection.description}::text`,
              `%${quickFilterValue}%`,
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
        ? buildStringFilterCondition(
            sectionFieldMap[searchField],
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
      if (!current) throw new NotFoundException('Menu section not found');
      await this.validateParentSection(
        tx,
        current.menuId,
        params.data.parentSectionId,
        params.where.id,
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
    if (!section) throw new NotFoundException('Menu section not found');

    const result = await this.db.transaction(async (tx) => {
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

    const recipeName = sql`(select ${recipe.name}::text from ${recipe} where ${recipe.menuItemId} = ${menuItem.id})`;

    const itemFieldMap: Record<string, Column | SQL> = {
      name: sql`${menuItem.name}::text`,
      recipe: recipeName,
      description: sql`${menuItem.description}::text`,
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

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] =
      sortBy && itemFieldMap[sortBy]
        ? [dir(itemFieldMap[sortBy])]
        : [asc(menuItem.sortOrder), asc(menuItem.id)];

    const where = and(
      eq(menuItem.menuSectionId, sectionId),
      filterField && filterOperator
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
          ilike(sql`${menuItem.name}::text`, `%${value}%`),
          ilike(sql`${menuItem.description}::text`, `%${value}%`),
          ilike(
            offerValue(
              sql`concat_ws(' ', ${offer.price}::text, ${offer.inventoryLevel}->>'value', ${offer.inventoryLevel}->>'unitText', ${offer.deliveryLeadTimeMinutes}::text, ${offer.priceSpecification}->>'price', ${offer.priceSpecification}->>'validFrom', ${offer.priceSpecification}->>'validThrough')`,
            ),
            `%${value}%`,
          ),
          ilike(recipeName, `%${value}%`),
          ilike(localTimeText(menuItem.createdAt), `%${value}%`),
          ilike(localTimeText(menuItem.updatedAt), `%${value}%`),
        ],
      }),
      searchField && searchOperator && searchValue
        ? buildStringFilterCondition(
            itemFieldMap[searchField],
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

    const result = await this.db.transaction(async (tx) => {
      const [previous] = itemData.name
        ? await tx
            .select({ name: menuItem.name })
            .from(menuItem)
            .where(eq(menuItem.id, params.where.id))
        : [];

      const [[updated], existingOffers] = await Promise.all([
        tx
          .update(menuItem)
          .set({ ...itemData, updatedAt: new Date() })
          .where(eq(menuItem.id, params.where.id))
          .returning(),
        tx
          .select()
          .from(offer)
          .where(eq(offer.menuItemId, params.where.id))
          .orderBy(asc(offer.createdAt))
          .limit(1),
      ]);
      if (!updated) throw new NotFoundException('Menu item not found');

      const renamed =
        !!previous && !isSameLocalizedText(previous.name, updated.name);

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
          .set({ ...offerData, updatedAt: new Date() })
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
      .set({ ...params.data, updatedAt: new Date() })
      .where(eq(offer.id, params.where.id))
      .returning();
    if (!updated) throw new NotFoundException('Offer not found');

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
      if (!current) throw new NotFoundException('Offer not found');

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
    if (!deleted) throw new NotFoundException('Offer not found');

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
    if (!row) throw new NotFoundException('Menu item not found');

    return row.menuId;
  }

  private async validateAddOnTargets(
    menuItemId: string,
    {
      addOnMenuItemId,
      addOnMenuSectionId,
    }: CreateMenuItemAddOnDto | UpdateMenuItemAddOnDto,
  ): Promise<void> {
    if (addOnMenuItemId === menuItemId) {
      throw new BadRequestException(
        'addOnMenuItemId must not be the menu item itself',
      );
    }

    const menuId = await this.menuIdOfItem(menuItemId);

    if (
      addOnMenuItemId &&
      (await this.menuIdOfItem(addOnMenuItemId)) !== menuId
    )
      throw new NotFoundException('Menu item not found');

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
      if (!target) throw new NotFoundException('Add-on menu section not found');
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

    const addOnFieldMap: Record<string, SQL> = {
      addOnMenuSectionName: sql<
        string | null
      >`COALESCE(${addOnMenuSection.name}::text, ${addOnMenuItemSection.name}::text)`,
      addOnMenuItemName: sql`${addOnMenuItem.name}::text`,
      createdAt: sql`${menuItemAddOn.createdAt}`,
      updatedAt: sql`${menuItemAddOn.updatedAt}`,
    };

    const filterCondition =
      filterField && filterOperator
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
      sortBy && addOnFieldMap[sortBy]
        ? [dir(addOnFieldMap[sortBy])]
        : [asc(menuItemAddOn.sortOrder), asc(menuItemAddOn.id)];

    const where = and(
      eq(menuItemAddOn.menuItemId, menuItemId),
      filterCondition,
      quickFilterValue
        ? or(
            ilike(
              sql`COALESCE(${addOnMenuSection.name}::text, ${addOnMenuItemSection.name}::text)`,
              `%${quickFilterValue}%`,
            ),
            ilike(sql`${addOnMenuItem.name}::text`, `%${quickFilterValue}%`),
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
    await this.validateAddOnTargets(where.menuItemId, data);

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
      throw new BadRequestException(
        'maxSelectionCount must be greater than or equal to minSelectionCount',
      );
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
      displayName: sql`${modifierGroup.displayName}::text`,
      minSelectionCount: modifierGroup.minSelectionCount,
      maxSelectionCount: modifierGroup.maxSelectionCount,
      createdAt: modifierGroup.createdAt,
      updatedAt: modifierGroup.updatedAt,
    };

    const filterCondition =
      filterField && filterOperator
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
      sortBy && fieldMap[sortBy]
        ? [dir(fieldMap[sortBy])]
        : [asc(modifierGroup.sortOrder), asc(modifierGroup.id)];

    const where = and(
      eq(modifierGroup.menuId, menuId),
      filterCondition,
      quickFilterValue
        ? or(
            ilike(
              sql`${modifierGroup.displayName}::text`,
              `%${quickFilterValue}%`,
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
      displayName: sql`${modifier.displayName}::text`,
      priceAdjustment: modifier.priceAdjustment,
      availability: sql`${modifier.availability}::text`,
      availableModes: modifier.availableModes,
      createdAt: modifier.createdAt,
      updatedAt: modifier.updatedAt,
    };

    const filterCondition =
      filterField && filterOperator
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
      sortBy && fieldMap[sortBy]
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
          ilike(sql`${modifier.displayName}::text`, `%${value}%`),
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
    if (!updated) throw new NotFoundException('Modifier not found');

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
    if (!deleted) throw new NotFoundException('Modifier not found');

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
    if (!group) throw new NotFoundException('Modifier group not found');

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
      displayName: sql`${modifierGroup.displayName}::text`,
      minSelectionCount: modifierGroup.minSelectionCount,
      maxSelectionCount: modifierGroup.maxSelectionCount,
      createdAt: menuItemModifierGroup.createdAt,
      updatedAt: menuItemModifierGroup.updatedAt,
    };

    const filterCondition =
      filterField && filterOperator
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
      sortBy && fieldMap[sortBy]
        ? [dir(fieldMap[sortBy])]
        : [asc(menuItemModifierGroup.sortOrder), asc(menuItemModifierGroup.id)];

    const where = and(
      eq(menuItemModifierGroup.menuItemId, menuItemId),
      filterCondition,
      quickFilterValue
        ? or(
            ilike(
              sql`${modifierGroup.displayName}::text`,
              `%${quickFilterValue}%`,
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
