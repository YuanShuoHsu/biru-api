import { Inject, Injectable } from '@nestjs/common';
import { asc, count, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import type { Menu, MenuItem, MenuSection } from 'src/db/schema/menus';
import { menu, menuItem, menuSection } from 'src/db/schema/menus';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type { CreateMenuItemDto } from './dto/create-menu-item.dto';
import type { CreateMenuSectionDto } from './dto/create-menu-section.dto';
import type { CreateMenuDto } from './dto/create-menu.dto';
import type { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import type { UpdateMenuSectionDto } from './dto/update-menu-section.dto';
import type { UpdateMenuDto } from './dto/update-menu.dto';

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
    pagination: { limit?: number; offset?: number } = {},
  ): Promise<{ data: MenuSection[]; total: number }> {
    const { limit = 10, offset = 0 } = pagination;

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(menuSection)
        .where(eq(menuSection.menuId, menuId))
        .orderBy(asc(menuSection.sortOrder), asc(menuSection.id))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(menuSection)
        .where(eq(menuSection.menuId, menuId)),
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
  ): Promise<MenuItem> {
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(menuItem)
      .where(eq(menuItem.menuSectionId, sectionId));

    const [created] = await this.db
      .insert(menuItem)
      .values({
        id: uuidv4(),
        menuSectionId: sectionId,
        sortOrder: total,
        ...data,
      })
      .returning();
    return created;
  }

  async menuSectionItems(
    sectionId: string,
    pagination: { limit?: number; offset?: number } = {},
  ): Promise<{ data: MenuItem[]; total: number }> {
    const { limit = 10, offset = 0 } = pagination;

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(menuItem)
        .where(eq(menuItem.menuSectionId, sectionId))
        .orderBy(asc(menuItem.sortOrder), asc(menuItem.id))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(menuItem)
        .where(eq(menuItem.menuSectionId, sectionId)),
    ]);

    return { data, total };
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
  }): Promise<MenuItem> {
    const [updated] = await this.db
      .update(menuItem)
      .set(params.data)
      .where(eq(menuItem.id, params.where.id))
      .returning();

    return updated;
  }

  async deleteMenuItem(where: { id: string }): Promise<MenuItem> {
    const [deleted] = await this.db
      .delete(menuItem)
      .where(eq(menuItem.id, where.id))
      .returning();

    return deleted;
  }
}
