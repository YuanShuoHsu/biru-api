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
  ilike,
  inArray,
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
import type { UpdateOfferDto } from './dto/update-offer.dto';

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
      .set({ ...params.data, updatedAt: new Date() })
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
      .set({ ...params.data, updatedAt: new Date() })
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
    query: MenuItemPaginationQueryDto = {},
  ): Promise<{ data: (MenuItem & { offer: Offer | null })[]; total: number }> {
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

    // 品項的價格相關欄位都存在 offer 表，取用與回傳資料一致的第一筆
    const offerValue = (column: Column | SQL): SQL =>
      sql`(select ${column} from ${offer} where ${offer.menuItemId} = ${menuItem.id} order by ${offer.createdAt} asc limit 1)`;

    const itemFieldMap: Record<string, Column | SQL> = {
      name: sql`${menuItem.name}::text`,
      description: sql`${menuItem.description}::text`,
      priceCurrency: offerValue(offer.priceCurrency),
      price: offerValue(sql`${offer.price}::numeric`),
      availability: offerValue(sql`${offer.availability}::text`),
      availableModes: menuItem.availableModes,
      inventoryLevel: offerValue(
        sql`NULLIF(${offer.inventoryLevel}->>'value', '')::numeric`,
      ),
      deliveryLeadTime: offerValue(
        sql`NULLIF(${offer.deliveryLeadTime}->>'value', '')::numeric`,
      ),
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
              sql`concat_ws(' ', ${offer.priceCurrency}, ${offer.price}::text, ${offer.inventoryLevel}->>'value', ${offer.inventoryLevel}->>'unitText', ${offer.deliveryLeadTime}->>'value', ${offer.deliveryLeadTime}->>'unitText', ${offer.priceSpecification}->>'price', ${offer.priceSpecification}->>'validFrom', ${offer.priceSpecification}->>'validThrough')`,
            ),
            `%${value}%`,
          ),
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

      if (!offerData) return { ...updated, offer: existingOffers[0] ?? null };

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
      .set({ ...params.data, updatedAt: new Date() })
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

  private validateAddOnMenuItem(
    menuItemId: string,
    addOnMenuItemId: string | null | undefined,
  ): void {
    if (addOnMenuItemId === menuItemId) {
      throw new BadRequestException(
        'addOnMenuItemId must not be the menu item itself',
      );
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
    this.validateAddOnMenuItem(menuItemId, data.addOnMenuItemId);

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
    const { menuItemId } = await this.findMenuItemAddOnById(id);
    this.validateAddOnMenuItem(menuItemId, data.addOnMenuItemId);

    await this.db
      .update(menuItemAddOn)
      .set({ ...data, updatedAt: new Date() })
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
      .set({ ...params.data, updatedAt: new Date() })
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
