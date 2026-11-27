import { Inject, Injectable } from '@nestjs/common';

import { asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';
import { v4 as uuidv4 } from 'uuid';

import type { Transaction } from '../attendance/attendance-audit.js';
import { orderByDirection } from '../common/utils/data-grid-sort.js';
import { toLanguage } from '../common/utils/language.js';
import { localizedTextSql } from '../common/utils/localized-text.js';
import { reorderSortOrders } from '../common/utils/sort-order.js';
import {
  catalogItem,
  catalogItemModifierGroup,
  catalogModifier,
  catalogModifierGroup,
  catalogSection,
  type CatalogItem,
  type CatalogModifier,
  type CatalogModifierGroup,
  type CatalogSection,
} from '../db/schema/catalog.js';
import { menu, menuItem, menuSection, modifier } from '../db/schema/menus.js';
import { organization } from '../db/schema/organizations.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import { ImageStorageService } from '../images/image-storage.service.js';
import { imageRefQuery, type WithImageRef } from '../images/image-url.js';
import {
  assertPromoDateRange,
  DRINK_OPTION_FIELDS,
  NEW_MENU_ITEM_DRINK_OPTIONS,
  resolveDrinkOptions,
  validateSelectionCounts,
} from '../menus/menus.service.js';

import {
  badRequestError,
  conflictError,
  notFoundError,
  type CatalogErrorCode,
} from './catalog-errors.js';
import type { CreateCatalogItemDto } from './dto/create-catalog-item.dto.js';
import type { CreateCatalogModifierGroupDto } from './dto/create-catalog-modifier-group.dto.js';
import type { CreateCatalogModifierDto } from './dto/create-catalog-modifier.dto.js';
import type { CreateCatalogSectionDto } from './dto/create-catalog-section.dto.js';
import type { UpdateCatalogItemDto } from './dto/update-catalog-item.dto.js';
import type { UpdateCatalogModifierGroupDto } from './dto/update-catalog-modifier-group.dto.js';
import type { UpdateCatalogModifierDto } from './dto/update-catalog-modifier.dto.js';
import type { UpdateCatalogSectionDto } from './dto/update-catalog-section.dto.js';

const assertBrandSection = (
  section: Pick<CatalogSection, 'ownerOrganizationId'> | undefined,
) => {
  if (!section) throw notFoundError('catalogSectionNotFound');
  if (section.ownerOrganizationId !== null)
    throw badRequestError('catalogItemSectionOwnerMismatch');
};

const assertNotListed = (
  code: CatalogErrorCode,
  key: string,
  rows: { id: string; name: string }[],
) => {
  if (!rows.length) return;

  const lang = toLanguage(I18nContext.current()?.lang);
  throw conflictError(
    code,
    { [key]: rows },
    {
      names: new Intl.ListFormat(lang, { type: 'conjunction' }).format(
        rows.map(({ name }) => name),
      ),
    },
  );
};

const organizationsOverriding = (tx: Transaction, where: SQL) =>
  tx
    .selectDistinct({ id: organization.id, name: organization.name })
    .from(modifier)
    .innerJoin(menu, eq(menu.id, modifier.menuId))
    .innerJoin(organization, eq(organization.id, menu.organizationId))
    .where(where)
    .orderBy(asc(organization.name), asc(organization.id));

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly imageStorage: ImageStorageService,
  ) {}

  private async validateParentSection(
    tx: Transaction,
    ownerOrganizationId: string | null,
    parentCatalogSectionId: string | null | undefined,
    sectionId?: string,
  ): Promise<void> {
    if (!parentCatalogSectionId) return;
    if (parentCatalogSectionId === sectionId)
      throw badRequestError('parentCatalogSectionSelf');

    const [parent] = await tx
      .select({ ownerOrganizationId: catalogSection.ownerOrganizationId })
      .from(catalogSection)
      .where(eq(catalogSection.id, parentCatalogSectionId))
      .for('key share');
    if (!parent) throw notFoundError('parentCatalogSectionNotFound');
    if (
      parent.ownerOrganizationId !== null &&
      parent.ownerOrganizationId !== ownerOrganizationId
    )
      throw badRequestError('parentCatalogSectionOwnerMismatch');
    if (!sectionId) return;

    // 兩個分類同時互設為上層時，各自檢查都看不到對方未提交的變更，會形成循環
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('catalog_section_tree', 0))`,
    );
    const { rows: ancestors } = await tx.execute<{ id: string }>(sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_catalog_section_id FROM catalog_section
        WHERE id = ${parentCatalogSectionId}
        UNION
        SELECT s.id, s.parent_catalog_section_id FROM catalog_section s
        JOIN ancestors a ON s.id = a.parent_catalog_section_id
      )
      SELECT id FROM ancestors
    `);
    if (ancestors.some(({ id }) => id === sectionId))
      throw badRequestError('parentCatalogSectionDescendant');
  }

  async createSection(data: CreateCatalogSectionDto): Promise<CatalogSection> {
    const image = await this.imageStorage.store('catalogSection', data.image);

    return this.db.transaction(async (tx) => {
      await this.validateParentSection(tx, null, data.parentCatalogSectionId);

      await tx
        .update(catalogSection)
        .set({ sortOrder: sql`${catalogSection.sortOrder} + 1` })
        .where(isNull(catalogSection.ownerOrganizationId));

      const [created] = await tx
        .insert(catalogSection)
        .values({ id: uuidv4(), sortOrder: 0, ...data, image })
        .returning();

      return created;
    });
  }

  sections(): Promise<WithImageRef<CatalogSection>[]> {
    return this.db.query.catalogSection.findMany({
      ...imageRefQuery,
      orderBy: [
        orderByDirection(catalogSection.ownerOrganizationId, 'asc', 'lowest'),
        asc(catalogSection.sortOrder),
        asc(catalogSection.id),
      ],
    });
  }

  async section(id: string): Promise<CatalogSection> {
    const found = await this.db.query.catalogSection.findFirst({
      where: eq(catalogSection.id, id),
    });
    if (!found) throw notFoundError('catalogSectionNotFound');

    return found;
  }

  async updateSection(
    id: string,
    data: UpdateCatalogSectionDto,
  ): Promise<CatalogSection> {
    const image = await this.imageStorage.store('catalogSection', data.image);

    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ ownerOrganizationId: catalogSection.ownerOrganizationId })
        .from(catalogSection)
        .where(eq(catalogSection.id, id));
      if (!current) throw notFoundError('catalogSectionNotFound');
      await this.validateParentSection(
        tx,
        current.ownerOrganizationId,
        data.parentCatalogSectionId,
        id,
      );

      const [updated] = await tx
        .update(catalogSection)
        .set({ ...data, image, updatedAt: new Date() })
        .where(eq(catalogSection.id, id))
        .returning();

      return updated;
    });
  }

  async reorderSections(ids: string[]): Promise<void> {
    await reorderSortOrders(
      this.db,
      catalogSection,
      ids,
      isNull(catalogSection.ownerOrganizationId),
    );
  }

  async deleteSection(id: string): Promise<CatalogSection> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: catalogSection.id })
        .from(catalogSection)
        .where(eq(catalogSection.id, id))
        .for('update');
      if (!current) throw notFoundError('catalogSectionNotFound');

      // https://orm.drizzle.team/docs/query-utils
      if (await tx.$count(catalogItem, eq(catalogItem.catalogSectionId, id)))
        throw conflictError('catalogSectionHasItems');
      if (
        await tx.$count(
          catalogSection,
          eq(catalogSection.parentCatalogSectionId, id),
        )
      )
        throw conflictError('catalogSectionHasSubsections');
      if (await tx.$count(menuSection, eq(menuSection.catalogSectionId, id)))
        throw conflictError('catalogSectionInUse');

      const [deleted] = await tx
        .delete(catalogSection)
        .where(eq(catalogSection.id, id))
        .returning();

      return deleted;
    });
  }

  async createItem(
    catalogSectionId: string,
    data: CreateCatalogItemDto,
  ): Promise<CatalogItem> {
    assertPromoDateRange(data.priceSpecification);
    assertBrandSection(
      await this.db.query.catalogSection.findFirst({
        where: eq(catalogSection.id, catalogSectionId),
        columns: { ownerOrganizationId: true },
      }),
    );
    const image = await this.imageStorage.store('catalogItem', data.image);

    return this.db.transaction(async (tx) => {
      const [section] = await tx
        .select({ ownerOrganizationId: catalogSection.ownerOrganizationId })
        .from(catalogSection)
        .where(eq(catalogSection.id, catalogSectionId))
        .for('key share');
      assertBrandSection(section);

      await tx
        .update(catalogItem)
        .set({ sortOrder: sql`${catalogItem.sortOrder} + 1` })
        .where(eq(catalogItem.catalogSectionId, catalogSectionId));

      const [created] = await tx
        .insert(catalogItem)
        .values({
          id: uuidv4(),
          catalogSectionId,
          sortOrder: 0,
          ...data,
          image,
          ...resolveDrinkOptions(NEW_MENU_ITEM_DRINK_OPTIONS, data),
        })
        .returning();

      return created;
    });
  }

  async items(catalogSectionId: string): Promise<WithImageRef<CatalogItem>[]> {
    await this.section(catalogSectionId);

    return this.db.query.catalogItem.findMany({
      ...imageRefQuery,
      where: eq(catalogItem.catalogSectionId, catalogSectionId),
      orderBy: [asc(catalogItem.sortOrder), asc(catalogItem.id)],
    });
  }

  async item(id: string): Promise<CatalogItem> {
    const found = await this.db.query.catalogItem.findFirst({
      where: eq(catalogItem.id, id),
    });
    if (!found) throw notFoundError('catalogItemNotFound');

    return found;
  }

  async updateItem(
    id: string,
    data: UpdateCatalogItemDto,
  ): Promise<CatalogItem> {
    assertPromoDateRange(data.priceSpecification);
    const touchesDrinkOptions = DRINK_OPTION_FIELDS.some(
      (field) => data[field] !== undefined,
    );
    const image = await this.imageStorage.store('catalogItem', data.image);

    return this.db.transaction(async (tx) => {
      const [current] = touchesDrinkOptions
        ? await tx
            .select({
              servingTemperatures: catalogItem.servingTemperatures,
              recommendedServingTemperatureLevel:
                catalogItem.recommendedServingTemperatureLevel,
              sweetness: catalogItem.sweetness,
              fixedSweetnessLevel: catalogItem.fixedSweetnessLevel,
              recommendedSweetnessLevel: catalogItem.recommendedSweetnessLevel,
            })
            .from(catalogItem)
            .where(eq(catalogItem.id, id))
            .for('update')
        : [];

      const [updated] = await tx
        .update(catalogItem)
        .set({
          ...data,
          image,
          ...(current && resolveDrinkOptions(current, data)),
          updatedAt: new Date(),
        })
        .where(eq(catalogItem.id, id))
        .returning();
      if (!updated) throw notFoundError('catalogItemNotFound');

      return updated;
    });
  }

  async reorderItems(catalogSectionId: string, ids: string[]): Promise<void> {
    await reorderSortOrders(
      this.db,
      catalogItem,
      ids,
      eq(catalogItem.catalogSectionId, catalogSectionId),
    );
  }

  async deleteItem(id: string): Promise<CatalogItem> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: catalogItem.id })
        .from(catalogItem)
        .where(eq(catalogItem.id, id))
        .for('update');
      if (!current) throw notFoundError('catalogItemNotFound');

      const organizations = await tx
        .selectDistinct({ id: organization.id, name: organization.name })
        .from(menuItem)
        .innerJoin(menu, eq(menu.id, menuItem.menuId))
        .innerJoin(organization, eq(organization.id, menu.organizationId))
        .where(eq(menuItem.catalogItemId, id))
        .orderBy(asc(organization.name), asc(organization.id));
      assertNotListed('catalogItemListed', 'organizations', organizations);

      const [deleted] = await tx
        .delete(catalogItem)
        .where(eq(catalogItem.id, id))
        .returning();

      return deleted;
    });
  }

  async createModifierGroup(
    data: CreateCatalogModifierGroupDto,
  ): Promise<CatalogModifierGroup> {
    validateSelectionCounts(
      data.minSelectionCount ?? 0,
      data.maxSelectionCount ?? null,
    );

    return this.db.transaction(async (tx) => {
      await tx
        .update(catalogModifierGroup)
        .set({ sortOrder: sql`${catalogModifierGroup.sortOrder} + 1` })
        .where(isNull(catalogModifierGroup.ownerOrganizationId));

      const [created] = await tx
        .insert(catalogModifierGroup)
        .values({ id: uuidv4(), sortOrder: 0, ...data })
        .returning();

      return created;
    });
  }

  modifierGroups(): Promise<CatalogModifierGroup[]> {
    return this.db.query.catalogModifierGroup.findMany({
      orderBy: [
        orderByDirection(
          catalogModifierGroup.ownerOrganizationId,
          'asc',
          'lowest',
        ),
        asc(catalogModifierGroup.sortOrder),
        asc(catalogModifierGroup.id),
      ],
    });
  }

  async modifierGroup(id: string): Promise<CatalogModifierGroup> {
    const found = await this.db.query.catalogModifierGroup.findFirst({
      where: eq(catalogModifierGroup.id, id),
    });
    if (!found) throw notFoundError('catalogModifierGroupNotFound');

    return found;
  }

  async updateModifierGroup(
    id: string,
    data: UpdateCatalogModifierGroupDto,
  ): Promise<CatalogModifierGroup> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          minSelectionCount: catalogModifierGroup.minSelectionCount,
          maxSelectionCount: catalogModifierGroup.maxSelectionCount,
        })
        .from(catalogModifierGroup)
        .where(eq(catalogModifierGroup.id, id))
        .for('update');
      if (!current) throw notFoundError('catalogModifierGroupNotFound');
      validateSelectionCounts(
        data.minSelectionCount ?? current.minSelectionCount,
        data.maxSelectionCount === undefined
          ? current.maxSelectionCount
          : data.maxSelectionCount,
      );

      const [updated] = await tx
        .update(catalogModifierGroup)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(catalogModifierGroup.id, id))
        .returning();

      return updated;
    });
  }

  async reorderModifierGroups(ids: string[]): Promise<void> {
    await reorderSortOrders(
      this.db,
      catalogModifierGroup,
      ids,
      isNull(catalogModifierGroup.ownerOrganizationId),
    );
  }

  async deleteModifierGroup(id: string): Promise<CatalogModifierGroup> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: catalogModifierGroup.id })
        .from(catalogModifierGroup)
        .where(eq(catalogModifierGroup.id, id))
        .for('update');
      if (!current) throw notFoundError('catalogModifierGroupNotFound');

      const lang = toLanguage(I18nContext.current()?.lang);
      assertNotListed(
        'catalogModifierGroupLinked',
        'catalogItems',
        await tx
          .select({
            id: catalogItem.id,
            name: localizedTextSql(catalogItem.name, lang).mapWith(String),
          })
          .from(catalogItemModifierGroup)
          .innerJoin(
            catalogItem,
            eq(catalogItem.id, catalogItemModifierGroup.catalogItemId),
          )
          .where(eq(catalogItemModifierGroup.catalogModifierGroupId, id))
          .orderBy(asc(catalogItem.sortOrder), asc(catalogItem.id)),
      );
      assertNotListed(
        'catalogModifierGroupInUse',
        'organizations',
        await organizationsOverriding(
          tx,
          inArray(
            modifier.catalogModifierId,
            tx
              .select({ id: catalogModifier.id })
              .from(catalogModifier)
              .where(eq(catalogModifier.catalogModifierGroupId, id)),
          ),
        ),
      );

      const [deleted] = await tx
        .delete(catalogModifierGroup)
        .where(eq(catalogModifierGroup.id, id))
        .returning();

      return deleted;
    });
  }

  async createModifier(
    catalogModifierGroupId: string,
    data: CreateCatalogModifierDto,
  ): Promise<CatalogModifier> {
    await this.modifierGroup(catalogModifierGroupId);
    const image = await this.imageStorage.store('catalogModifier', data.image);

    return this.db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: catalogModifierGroup.id })
        .from(catalogModifierGroup)
        .where(eq(catalogModifierGroup.id, catalogModifierGroupId))
        .for('key share');
      if (!group) throw notFoundError('catalogModifierGroupNotFound');

      await tx
        .update(catalogModifier)
        .set({ sortOrder: sql`${catalogModifier.sortOrder} + 1` })
        .where(
          eq(catalogModifier.catalogModifierGroupId, catalogModifierGroupId),
        );

      const [created] = await tx
        .insert(catalogModifier)
        .values({
          id: uuidv4(),
          catalogModifierGroupId,
          sortOrder: 0,
          ...data,
          image,
        })
        .returning();

      return created;
    });
  }

  async modifiers(
    catalogModifierGroupId: string,
  ): Promise<WithImageRef<CatalogModifier>[]> {
    await this.modifierGroup(catalogModifierGroupId);

    return this.db.query.catalogModifier.findMany({
      ...imageRefQuery,
      where: eq(catalogModifier.catalogModifierGroupId, catalogModifierGroupId),
      orderBy: [asc(catalogModifier.sortOrder), asc(catalogModifier.id)],
    });
  }

  async modifier(id: string): Promise<CatalogModifier> {
    const found = await this.db.query.catalogModifier.findFirst({
      where: eq(catalogModifier.id, id),
    });
    if (!found) throw notFoundError('catalogModifierNotFound');

    return found;
  }

  async updateModifier(
    id: string,
    data: UpdateCatalogModifierDto,
  ): Promise<CatalogModifier> {
    const image = await this.imageStorage.store('catalogModifier', data.image);
    const [updated] = await this.db
      .update(catalogModifier)
      .set({ ...data, image, updatedAt: new Date() })
      .where(eq(catalogModifier.id, id))
      .returning();
    if (!updated) throw notFoundError('catalogModifierNotFound');

    return updated;
  }

  async reorderModifiers(
    catalogModifierGroupId: string,
    ids: string[],
  ): Promise<void> {
    await reorderSortOrders(
      this.db,
      catalogModifier,
      ids,
      eq(catalogModifier.catalogModifierGroupId, catalogModifierGroupId),
    );
  }

  async deleteModifier(id: string): Promise<CatalogModifier> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: catalogModifier.id })
        .from(catalogModifier)
        .where(eq(catalogModifier.id, id))
        .for('update');
      if (!current) throw notFoundError('catalogModifierNotFound');

      assertNotListed(
        'catalogModifierInUse',
        'organizations',
        await organizationsOverriding(tx, eq(modifier.catalogModifierId, id)),
      );

      const [deleted] = await tx
        .delete(catalogModifier)
        .where(eq(catalogModifier.id, id))
        .returning();

      return deleted;
    });
  }
}
