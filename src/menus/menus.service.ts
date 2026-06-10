import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import {
  Column,
  SQL,
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notIlike,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { v4 as uuidv4 } from 'uuid';

import type { LocalizedText } from 'src/db/schema/enums';
import type {
  Menu,
  MenuItem,
  MenuItemAddOn,
  MenuItemModifierGroup,
  MenuSection,
  Modifier,
  ModifierGroup,
  Offer,
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
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

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
  MODIFIER_DATE_FILTER_FIELDS,
  MODIFIER_STRING_FILTER_FIELDS,
  type ModifierPaginationQueryDto,
} from './dto/modifier-pagination-query.dto';
import {
  DATE_FILTER_FIELDS,
  PaginationQueryDto,
  STRING_FILTER_FIELDS,
} from './dto/pagination-query.dto';
import type { UpdateMenuItemAddOnDto } from './dto/update-menu-item-add-on.dto';
import type { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import type { UpdateMenuSectionDto } from './dto/update-menu-section.dto';
import type { UpdateMenuDto } from './dto/update-menu.dto';
import type { UpdateModifierGroupDto } from './dto/update-modifier-group.dto';
import type { UpdateModifierDto } from './dto/update-modifier.dto';
import type { UpdateOfferDto } from './dto/update-offer.dto';

const NO_VALUE_OPERATORS: readonly string[] = ['isEmpty', 'isNotEmpty'];

const buildStringFilterCondition = (
  column: Column | SQL,
  operator: string,
  value: string,
): SQL | undefined => {
  const colSql = sql`${column}`;

  switch (operator) {
    case 'contains':
      return ilike(colSql, `%${value}%`);
    case 'doesNotContain':
      return notIlike(colSql, `%${value}%`);
    case 'equals':
      return eq(colSql, value);
    case 'doesNotEqual':
      return ne(colSql, value);
    case 'startsWith':
      return ilike(colSql, `${value}%`);
    case 'endsWith':
      return ilike(colSql, `%${value}`);
    case 'isEmpty':
      return or(isNull(colSql), eq(colSql, ''));
    case 'isNotEmpty':
      return and(isNotNull(colSql), ne(colSql, ''));
    case 'isAnyOf': {
      const values = value.split(',').filter(Boolean);
      if (values.length === 0) return undefined;

      return values.length === 1
        ? eq(colSql, values[0])
        : inArray(colSql, values);
    }
  }
};

const buildDateFilterCondition = (
  column: Column | SQL,
  operator: string,
  value: string,
): SQL | undefined => {
  const colSql = sql`${column}`;

  if (operator === 'isEmpty') return isNull(colSql);
  if (operator === 'isNotEmpty') return isNotNull(colSql);
  if (!value) return undefined;

  const dateCast = sql`${colSql}::date`;

  switch (operator) {
    case 'is':
      return eq(dateCast, value);
    case 'not':
      return ne(dateCast, value);
    case 'after':
      return gt(dateCast, value);
    case 'onOrAfter':
      return gte(dateCast, value);
    case 'before':
      return lt(dateCast, value);
    case 'onOrBefore':
      return lte(dateCast, value);
  }
};

const buildFilterCondition = (
  filterField: string,
  filterOperator: string,
  filterValue: string | undefined,
  fieldMap: Record<string, Column | SQL>,
  stringFields: readonly string[],
  dateFields: readonly string[],
): SQL | undefined => {
  const column = fieldMap[filterField];
  if (!column) return undefined;

  if (stringFields.includes(filterField)) {
    if (!filterValue && !NO_VALUE_OPERATORS.includes(filterOperator))
      return undefined;

    return buildStringFilterCondition(
      column,
      filterOperator,
      filterValue || '',
    );
  }

  if (dateFields.includes(filterField)) {
    return buildDateFilterCondition(column, filterOperator, filterValue || '');
  }
};

@Injectable()
export class MenusService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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
      .set(params.data)
      .where(eq(menu.id, params.where.id))
      .returning();

    return updated;
  }

  // ── MenuSection ───────────────────────────────────────────────────

  async createMenuSection(
    menuId: string,
    data: CreateMenuSectionDto,
  ): Promise<MenuSection> {
    return this.db.transaction(async (tx) => {
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
    query: PaginationQueryDto = {},
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
      timezone = 'UTC',
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
            STRING_FILTER_FIELDS,
            DATE_FILTER_FIELDS,
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
              sql`TO_CHAR(${menuSection.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
              `%${quickFilterValue}%`,
            ),
            ilike(
              sql`TO_CHAR(${menuSection.updatedAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
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
    _menuId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(menuSection)
          .set({ sortOrder: offset + i })
          .where(eq(menuSection.id, id));
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
    const [updated] = await this.db
      .update(menuSection)
      .set(params.data)
      .where(eq(menuSection.id, params.where.id))
      .returning();

    return updated;
  }

  async deleteMenuSection(where: { id: string }): Promise<MenuSection> {
    const [deleted] = await this.db
      .delete(menuSection)
      .where(eq(menuSection.id, where.id))
      .returning();

    return deleted;
  }

  // ── MenuItem ──────────────────────────────────────────────────────

  async createMenuItem(
    sectionId: string,
    data: CreateMenuItemDto,
  ): Promise<MenuItem & { offer: Offer | null }> {
    const { offer: offerData, ...itemData } = data;

    const section = await this.db.query.menuSection.findFirst({
      where: eq(menuSection.id, sectionId),
      columns: { menuId: true },
    });

    return this.db.transaction(async (tx) => {
      await tx
        .update(menuItem)
        .set({ sortOrder: sql`${menuItem.sortOrder} + 1` })
        .where(eq(menuItem.menuSectionId, sectionId));

      const [created] = await tx
        .insert(menuItem)
        .values({
          id: uuidv4(),
          menuSectionId: sectionId,
          menuId: section?.menuId,
          sortOrder: 0,
          ...itemData,
        })
        .returning();

      if (!offerData) return { ...created, offer: null };

      const [createdOffer] = await tx
        .insert(offer)
        .values({ id: uuidv4(), menuItemId: created.id, ...offerData })
        .returning();

      return { ...created, offer: createdOffer };
    });
  }

  async menuItem(where: {
    id: string;
  }): Promise<(MenuItem & { offer: Offer | null }) | null> {
    const [result, existingOffers] = await Promise.all([
      this.db.query.menuItem.findFirst({
        where: eq(menuItem.id, where.id),
      }),
      this.db
        .select()
        .from(offer)
        .where(eq(offer.menuItemId, where.id))
        .orderBy(asc(offer.createdAt))
        .limit(1),
    ]);
    if (!result) return null;

    return { ...result, offer: existingOffers[0] || null };
  }

  async menuSectionItems(
    sectionId: string,
    query: PaginationQueryDto = {},
  ): Promise<{ data: (MenuItem & { offer: Offer | null })[]; total: number }> {
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
      timezone = 'UTC',
    } = query;

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] = sortBy
      ? [dir(menuItem[sortBy])]
      : [asc(menuItem.sortOrder), asc(menuItem.id)];

    const itemFieldMap: Record<string, Column | SQL> = {
      name: sql`${menuItem.name}::text`,
      description: sql`${menuItem.description}::text`,
      createdAt: menuItem.createdAt,
      updatedAt: menuItem.updatedAt,
    };

    const where = and(
      eq(menuItem.menuSectionId, sectionId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            itemFieldMap,
            STRING_FILTER_FIELDS,
            DATE_FILTER_FIELDS,
          )
        : undefined,
      quickFilterValue
        ? or(
            ilike(sql`${menuItem.name}::text`, `%${quickFilterValue}%`),
            ilike(sql`${menuItem.description}::text`, `%${quickFilterValue}%`),
            ilike(
              sql`TO_CHAR(${menuItem.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
              `%${quickFilterValue}%`,
            ),
            ilike(
              sql`TO_CHAR(${menuItem.updatedAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
              `%${quickFilterValue}%`,
            ),
          )
        : undefined,
      searchField && searchOperator && searchValue
        ? buildStringFilterCondition(
            itemFieldMap[searchField],
            searchOperator,
            searchValue,
          )
        : undefined,
    );

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(menuItem)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(menuItem).where(where),
    ]);

    const itemIds = data.map((item) => item.id);
    const offers =
      itemIds.length > 0
        ? await this.db
            .select()
            .from(offer)
            .where(inArray(offer.menuItemId, itemIds))
            .orderBy(asc(offer.createdAt))
        : [];

    const offerByItemId = new Map<string, Offer>();
    for (const o of offers) {
      if (o.menuItemId && !offerByItemId.has(o.menuItemId)) {
        offerByItemId.set(o.menuItemId, o);
      }
    }

    return {
      data: data.map((item) => ({
        ...item,
        offer: offerByItemId.get(item.id) ?? null,
      })),
      total,
    };
  }

  async reorderMenuItems(
    _sectionId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(menuItem)
          .set({ sortOrder: offset + i })
          .where(eq(menuItem.id, id));
      }
    });
  }

  async updateMenuItem(params: {
    where: { id: string };
    data: UpdateMenuItemDto;
  }): Promise<MenuItem & { offer: Offer | null }> {
    const { offer: offerData, ...itemData } = params.data;

    return this.db.transaction(async (tx) => {
      const [[updated], existingOffers] = await Promise.all([
        tx
          .update(menuItem)
          .set(itemData)
          .where(eq(menuItem.id, params.where.id))
          .returning(),
        tx
          .select()
          .from(offer)
          .where(eq(offer.menuItemId, params.where.id))
          .orderBy(asc(offer.createdAt))
          .limit(1),
      ]);

      if (!offerData) return { ...updated, offer: existingOffers[0] ?? null };

      const existingOffer = existingOffers[0];
      let resultOffer: Offer;

      if (existingOffer) {
        const [updatedOffer] = await tx
          .update(offer)
          .set(offerData)
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

      return { ...updated, offer: resultOffer };
    });
  }

  async deleteMenuItem(where: {
    id: string;
  }): Promise<MenuItem & { offer: Offer | null }> {
    const [deleted] = await this.db
      .delete(menuItem)
      .where(eq(menuItem.id, where.id))
      .returning();

    return { ...deleted, offer: null };
  }

  // ── Offer ─────────────────────────────────────────────────────────

  async createOffer(menuItemId: string, data: CreateOfferDto): Promise<Offer> {
    const [created] = await this.db
      .insert(offer)
      .values({ id: uuidv4(), menuItemId, ...data })
      .returning();

    return created;
  }

  async menuItemOffers(menuItemId: string): Promise<Offer[]> {
    return this.db
      .select()
      .from(offer)
      .where(eq(offer.menuItemId, menuItemId))
      .orderBy(asc(offer.createdAt));
  }

  async updateOffer(params: {
    where: { id: string };
    data: UpdateOfferDto;
  }): Promise<Offer> {
    const [updated] = await this.db
      .update(offer)
      .set(params.data)
      .where(eq(offer.id, params.where.id))
      .returning();

    return updated;
  }

  async deleteOffer(where: { id: string }): Promise<Offer> {
    const [deleted] = await this.db
      .delete(offer)
      .where(eq(offer.id, where.id))
      .returning();

    return deleted;
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
      timezone = 'UTC',
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
              sql`TO_CHAR(${menuItemAddOn.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
              `%${quickFilterValue}%`,
            ),
            ilike(
              sql`TO_CHAR(${menuItemAddOn.updatedAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
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
    _menuItemId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(menuItemAddOn)
          .set({ sortOrder: offset + i })
          .where(eq(menuItemAddOn.id, id));
      }
    });
  }

  async updateMenuItemAddOn(
    id: string,
    data: UpdateMenuItemAddOnDto,
  ): Promise<
    MenuItemAddOn & {
      addOnMenuItemName: LocalizedText | null;
      addOnMenuSectionName: LocalizedText | null;
      addOnMenuItemSectionId: string | null;
      addOnMenuItemSectionName: LocalizedText | null;
    }
  > {
    await this.db
      .update(menuItemAddOn)
      .set(data)
      .where(eq(menuItemAddOn.id, id));

    return this.findMenuItemAddOnById(id);
  }

  async deleteMenuItemAddOn(where: { id: string }): Promise<
    MenuItemAddOn & {
      addOnMenuItemName: LocalizedText | null;
      addOnMenuSectionName: LocalizedText | null;
      addOnMenuItemSectionId: string | null;
      addOnMenuItemSectionName: LocalizedText | null;
    }
  > {
    const found = await this.findMenuItemAddOnById(where.id);
    await this.db.delete(menuItemAddOn).where(eq(menuItemAddOn.id, where.id));

    return found;
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
    query: ModifierPaginationQueryDto = {},
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
      timezone = 'UTC',
    } = query;

    const fieldMap: Record<string, Column | SQL> = {
      displayName: sql`${modifierGroup.displayName}::text`,
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
            MODIFIER_STRING_FILTER_FIELDS,
            MODIFIER_DATE_FILTER_FIELDS,
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
              sql`TO_CHAR(${modifierGroup.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
              `%${quickFilterValue}%`,
            ),
            ilike(
              sql`TO_CHAR(${modifierGroup.updatedAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
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
    _menuId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(modifierGroup)
          .set({ sortOrder: offset + i })
          .where(eq(modifierGroup.id, id));
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
      .set(params.data)
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

  // ── Modifier ──────────────────────────────────────────────────────

  async createModifier(
    modifierGroupId: string,
    data: CreateModifierDto,
  ): Promise<Modifier> {
    return this.db.transaction(async (tx) => {
      await tx
        .update(modifier)
        .set({ sortOrder: sql`${modifier.sortOrder} + 1` })
        .where(eq(modifier.modifierGroupId, modifierGroupId));

      const [created] = await tx
        .insert(modifier)
        .values({ id: uuidv4(), modifierGroupId, sortOrder: 0, ...data })
        .returning();

      return created;
    });
  }

  async modifiers(
    modifierGroupId: string,
    query: ModifierPaginationQueryDto = {},
  ): Promise<{ data: Modifier[]; total: number }> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterValue,
      sortBy,
      sortDirection = 'asc',
      timezone = 'UTC',
    } = query;

    const fieldMap: Record<string, Column | SQL> = {
      displayName: sql`${modifier.displayName}::text`,
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
      quickFilterValue
        ? or(
            ilike(sql`${modifier.displayName}::text`, `%${quickFilterValue}%`),
            ilike(
              sql`TO_CHAR(${modifier.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
              `%${quickFilterValue}%`,
            ),
            ilike(
              sql`TO_CHAR(${modifier.updatedAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
              `%${quickFilterValue}%`,
            ),
          )
        : undefined,
    );

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(modifier)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(modifier).where(where),
    ]);

    return { data, total };
  }

  async reorderModifiers(
    _modifierGroupId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(modifier)
          .set({ sortOrder: offset + i })
          .where(eq(modifier.id, id));
      }
    });
  }

  async updateModifier(params: {
    where: { id: string };
    data: UpdateModifierDto;
  }): Promise<Modifier> {
    const [updated] = await this.db
      .update(modifier)
      .set(params.data)
      .where(eq(modifier.id, params.where.id))
      .returning();

    return updated;
  }

  async deleteModifier(where: { id: string }): Promise<Modifier> {
    const [deleted] = await this.db
      .delete(modifier)
      .where(eq(modifier.id, where.id))
      .returning();

    return deleted;
  }

  // ── MenuItemModifierGroup ─────────────────────────────────────────

  async createMenuItemModifierGroup(
    menuItemId: string,
    data: CreateMenuItemModifierGroupDto,
  ): Promise<MenuItemModifierGroup> {
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
    query: ModifierPaginationQueryDto = {},
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
      timezone = 'UTC',
    } = query;

    const fieldMap: Record<string, Column | SQL> = {
      displayName: sql`${modifierGroup.displayName}::text`,
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
            MODIFIER_STRING_FILTER_FIELDS,
            MODIFIER_DATE_FILTER_FIELDS,
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
              sql`TO_CHAR(${menuItemModifierGroup.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
              `%${quickFilterValue}%`,
            ),
            ilike(
              sql`TO_CHAR(${menuItemModifierGroup.updatedAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
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
    _menuItemId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(menuItemModifierGroup)
          .set({ sortOrder: offset + i })
          .where(eq(menuItemModifierGroup.id, id));
      }
    });
  }

  async deleteMenuItemModifierGroup(where: {
    id: string;
  }): Promise<MenuItemModifierGroup> {
    const [deleted] = await this.db
      .delete(menuItemModifierGroup)
      .where(eq(menuItemModifierGroup.id, where.id))
      .returning();

    return deleted;
  }
}
