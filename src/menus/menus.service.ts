import { Inject, Injectable } from '@nestjs/common';
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

import type {
  Menu,
  MenuItem,
  MenuItemAddOn,
  MenuSection,
  Offer,
} from 'src/db/schema/menus';
import {
  menu,
  menuItem,
  menuItemAddOn,
  menuSection,
  offer,
} from 'src/db/schema/menus';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type { CreateMenuItemAddOnDto } from './dto/create-menu-item-add-on.dto';
import type { CreateMenuItemDto } from './dto/create-menu-item.dto';
import type { CreateMenuSectionDto } from './dto/create-menu-section.dto';
import type { CreateMenuDto } from './dto/create-menu.dto';
import type { CreateOfferDto } from './dto/create-offer.dto';
import {
  DATE_FILTER_FIELDS,
  PaginationQueryDto,
  STRING_FILTER_FIELDS,
  type FilterField,
  type FilterOperator,
} from './dto/pagination-query.dto';
import type { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import type { UpdateMenuSectionDto } from './dto/update-menu-section.dto';
import type { UpdateMenuDto } from './dto/update-menu.dto';
import type { UpdateOfferDto } from './dto/update-offer.dto';

const NO_VALUE_OPERATORS: readonly string[] = ['isEmpty', 'isNotEmpty'];

const buildStringFilterCondition = (
  col: Column,
  operator: string,
  value: string,
): SQL | undefined => {
  switch (operator) {
    case 'contains':
      return ilike(col, `%${value}%`);
    case 'doesNotContain':
      return notIlike(col, `%${value}%`);
    case 'equals':
      return eq(col, value);
    case 'doesNotEqual':
      return ne(col, value);
    case 'startsWith':
      return ilike(col, `${value}%`);
    case 'endsWith':
      return ilike(col, `%${value}`);
    case 'isEmpty':
      return or(isNull(col), eq(col, ''));
    case 'isNotEmpty':
      return and(isNotNull(col), ne(col, ''));
    case 'isAnyOf': {
      const values = value.split(',').filter(Boolean);
      if (values.length === 0) return undefined;

      return values.length === 1 ? eq(col, values[0]) : inArray(col, values);
    }
  }
};

const buildDateFilterCondition = (
  col: Column,
  operator: string,
  value: string,
): SQL | undefined => {
  if (operator === 'isEmpty') return isNull(col);
  if (operator === 'isNotEmpty') return isNotNull(col);
  if (!value) return undefined;

  const dateCast = sql`${col}::date`;

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
  filterField: FilterField,
  filterOperator: FilterOperator,
  filterValue: string | undefined,
  fieldMap: Record<string, Column>,
): SQL | undefined => {
  const column = fieldMap[filterField];
  if (!column) return undefined;

  if ((STRING_FILTER_FIELDS as readonly string[]).includes(filterField)) {
    if (!filterValue && !NO_VALUE_OPERATORS.includes(filterOperator))
      return undefined;

    return buildStringFilterCondition(
      column,
      filterOperator,
      filterValue || '',
    );
  }

  if ((DATE_FILTER_FIELDS as readonly string[]).includes(filterField)) {
    return buildDateFilterCondition(column, filterOperator, filterValue || '');
  }
};

@Injectable()
export class MenusService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  // ── Menu ──────────────────────────────────────────────────────────

  async createMenu(organizationId: string, data: CreateMenuDto): Promise<Menu> {
    const [created] = await this.db
      .insert(menu)
      .values({ id: uuidv4(), organizationId, ...data })
      .returning();

    return created;
  }

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

  async deleteMenu(where: { id: string }): Promise<Menu> {
    const [deleted] = await this.db
      .delete(menu)
      .where(eq(menu.id, where.id))
      .returning();

    return deleted;
  }

  // ── MenuSection ───────────────────────────────────────────────────

  async createMenuSection(
    menuId: string,
    data: CreateMenuSectionDto,
  ): Promise<MenuSection> {
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(menuSection)
      .where(eq(menuSection.menuId, menuId));

    const [created] = await this.db
      .insert(menuSection)
      .values({ id: uuidv4(), menuId, sortOrder: total, ...data })
      .returning();

    return created;
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

    const sectionFieldMap: Record<string, Column> = {
      name: menuSection.name,
      description: menuSection.description,
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
          )
        : undefined,
      quickFilterValue
        ? or(
            ilike(menuSection.name, `%${quickFilterValue}%`),
            ilike(menuSection.description, `%${quickFilterValue}%`),
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

    const [section, [{ total }]] = await Promise.all([
      this.db.query.menuSection.findFirst({
        where: eq(menuSection.id, sectionId),
        columns: { menuId: true },
      }),
      this.db
        .select({ total: count() })
        .from(menuItem)
        .where(eq(menuItem.menuSectionId, sectionId)),
    ]);

    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(menuItem)
        .values({
          id: uuidv4(),
          menuSectionId: sectionId,
          menuId: section?.menuId,
          sortOrder: total,
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

    const itemFieldMap: Record<string, Column> = {
      name: menuItem.name,
      description: menuItem.description,
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
          )
        : undefined,
      quickFilterValue
        ? or(
            ilike(menuItem.name, `%${quickFilterValue}%`),
            ilike(menuItem.description, `%${quickFilterValue}%`),
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
    const [[updated], existingOffers] = await Promise.all([
      this.db
        .update(menuItem)
        .set(params.data)
        .where(eq(menuItem.id, params.where.id))
        .returning(),
      this.db
        .select()
        .from(offer)
        .where(eq(offer.menuItemId, params.where.id))
        .orderBy(asc(offer.createdAt))
        .limit(1),
    ]);

    return { ...updated, offer: existingOffers[0] ?? null };
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
    return { addOnMenuItem, addOnMenuSection };
  }

  private async findMenuItemAddOnById(id: string): Promise<
    MenuItemAddOn & {
      addOnMenuItemName: string | null;
      addOnMenuSectionName: string | null;
    }
  > {
    const { addOnMenuItem, addOnMenuSection } = this.menuItemAddOnWithNames();
    const [row] = await this.db
      .select({
        ...getTableColumns(menuItemAddOn),
        addOnMenuItemName: addOnMenuItem.name,
        addOnMenuSectionName: addOnMenuSection.name,
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
      .where(eq(menuItemAddOn.id, id));

    return row;
  }

  async createMenuItemAddOn(
    menuItemId: string,
    data: CreateMenuItemAddOnDto,
  ): Promise<
    MenuItemAddOn & {
      addOnMenuItemName: string | null;
      addOnMenuSectionName: string | null;
    }
  > {
    const [created] = await this.db
      .insert(menuItemAddOn)
      .values({ id: uuidv4(), menuItemId, ...data })
      .returning();

    return this.findMenuItemAddOnById(created.id);
  }

  async menuItemAddOns(menuItemId: string): Promise<
    (MenuItemAddOn & {
      addOnMenuItemName: string | null;
      addOnMenuSectionName: string | null;
    })[]
  > {
    const { addOnMenuItem, addOnMenuSection } = this.menuItemAddOnWithNames();

    return this.db
      .select({
        ...getTableColumns(menuItemAddOn),
        addOnMenuItemName: addOnMenuItem.name,
        addOnMenuSectionName: addOnMenuSection.name,
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
      .where(eq(menuItemAddOn.menuItemId, menuItemId))
      .orderBy(asc(menuItemAddOn.createdAt));
  }

  async deleteMenuItemAddOn(where: { id: string }): Promise<
    MenuItemAddOn & {
      addOnMenuItemName: string | null;
      addOnMenuSectionName: string | null;
    }
  > {
    const found = await this.findMenuItemAddOnById(where.id);
    await this.db.delete(menuItemAddOn).where(eq(menuItemAddOn.id, where.id));

    return found;
  }
}
