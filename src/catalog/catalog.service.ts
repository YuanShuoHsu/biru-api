import { Inject, Injectable } from '@nestjs/common';

import { asc, eq, isNull, sql } from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';
import { v4 as uuidv4 } from 'uuid';

import type { Transaction } from '../attendance/attendance-audit.js';
import { SERVING_TEMPERATURE_OF_LEVEL } from '../common/constants/serving-temperature.js';
import { orderByDirection } from '../common/utils/data-grid-sort.js';
import { toLanguage } from '../common/utils/language.js';
import { reorderSortOrders } from '../common/utils/sort-order.js';
import {
  catalogItem,
  catalogSection,
  type CatalogItem,
  type CatalogSection,
} from '../db/schema/catalog.js';
import { menu, menuItem, menuSection } from '../db/schema/menus.js';
import { organization } from '../db/schema/organizations.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import { ImageStorageService } from '../images/image-storage.service.js';
import { imageRefQuery, type WithImageRef } from '../images/image-url.js';

import {
  badRequestError,
  conflictError,
  notFoundError,
} from './catalog-errors.js';
import type { CreateCatalogItemDto } from './dto/create-catalog-item.dto.js';
import type { CreateCatalogSectionDto } from './dto/create-catalog-section.dto.js';
import type { UpdateCatalogItemDto } from './dto/update-catalog-item.dto.js';
import type { UpdateCatalogSectionDto } from './dto/update-catalog-section.dto.js';

type DrinkOptions = Pick<
  CatalogItem,
  | 'servingTemperatures'
  | 'recommendedServingTemperatureLevel'
  | 'sweetness'
  | 'fixedSweetnessLevel'
  | 'recommendedSweetnessLevel'
>;

const NEW_ITEM_DRINK_OPTIONS: DrinkOptions = {
  servingTemperatures: [],
  recommendedServingTemperatureLevel: null,
  sweetness: 'NotApplicable',
  fixedSweetnessLevel: null,
  recommendedSweetnessLevel: null,
};

const resolveDrinkOptions = (
  current: DrinkOptions,
  data: UpdateCatalogItemDto,
): Omit<DrinkOptions, 'servingTemperatures' | 'sweetness'> => {
  const next = <K extends keyof DrinkOptions>(field: K): DrinkOptions[K] =>
    data[field] === undefined
      ? current[field]
      : (data[field] as DrinkOptions[K]);

  const sweetness = next('sweetness');
  const temperatureLevel = next('recommendedServingTemperatureLevel');
  const fixedSweetnessLevel =
    sweetness === 'Fixed' ? next('fixedSweetnessLevel') : null;
  if (sweetness === 'Fixed' && !fixedSweetnessLevel)
    throw badRequestError('fixedSweetnessLevelRequired');

  return {
    recommendedServingTemperatureLevel:
      temperatureLevel &&
      next('servingTemperatures').includes(
        SERVING_TEMPERATURE_OF_LEVEL[temperatureLevel],
      )
        ? temperatureLevel
        : null,
    fixedSweetnessLevel,
    recommendedSweetnessLevel:
      sweetness === 'Adjustable' ? next('recommendedSweetnessLevel') : null,
  };
};

const assertPromoDateRange = ({ priceSpecification }: UpdateCatalogItemDto) => {
  const { validFrom, validThrough } = priceSpecification ?? {};
  if (validFrom && validThrough && validFrom > validThrough)
    throw badRequestError('promoDateRangeInvalid');
};

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
    assertPromoDateRange(data);
    const image = await this.imageStorage.store('catalogItem', data.image);

    return this.db.transaction(async (tx) => {
      const [section] = await tx
        .select({ ownerOrganizationId: catalogSection.ownerOrganizationId })
        .from(catalogSection)
        .where(eq(catalogSection.id, catalogSectionId))
        .for('key share');
      if (!section) throw notFoundError('catalogSectionNotFound');
      if (section.ownerOrganizationId !== null)
        throw badRequestError('catalogItemSectionOwnerMismatch');

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
          ...resolveDrinkOptions(NEW_ITEM_DRINK_OPTIONS, data),
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
    assertPromoDateRange(data);
    const image = await this.imageStorage.store('catalogItem', data.image);

    return this.db.transaction(async (tx) => {
      const [current] = await tx
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
        .for('update');
      if (!current) throw notFoundError('catalogItemNotFound');

      const [updated] = await tx
        .update(catalogItem)
        .set({
          ...data,
          image,
          ...resolveDrinkOptions(current, data),
          updatedAt: new Date(),
        })
        .where(eq(catalogItem.id, id))
        .returning();

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
      if (organizations.length) {
        const lang = toLanguage(I18nContext.current()?.lang);
        throw conflictError(
          'catalogItemListed',
          { organizations },
          {
            names: new Intl.ListFormat(lang, { type: 'conjunction' }).format(
              organizations.map(({ name }) => name),
            ),
          },
        );
      }

      const [deleted] = await tx
        .delete(catalogItem)
        .where(eq(catalogItem.id, id))
        .returning();

      return deleted;
    });
  }
}
