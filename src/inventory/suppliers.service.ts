import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';

import { startDeletedRecordBatch } from '../deleted-records/request-batch.js';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from '../common/utils/data-grid-filters.js';
import { toLanguage } from '../common/utils/language.js';
import { localizedTextSql } from '../common/utils/localized-text.js';
import { getOrganizationIdBySlug } from '../common/utils/organizations.js';
import { ingredient, supplier } from '../db/schema/inventory.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from './dto/create-supplier.dto.js';
import {
  SUPPLIER_DATE_FILTER_FIELDS,
  SUPPLIER_STRING_FILTER_FIELDS,
  SupplierPaginationQueryDto,
} from './dto/supplier-pagination-query.dto.js';
import {
  SupplierIngredientResponseDto,
  SupplierResponseDto,
} from './dto/supplier-response.dto.js';

type Tx = Pick<DrizzleDB, 'update'>;

@Injectable()
export class SuppliersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll(
    organizationSlug: string,
    query: SupplierPaginationQueryDto = {},
  ): Promise<{ data: SupplierResponseDto[]; total: number }> {
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
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    const fieldMap: Record<string, Column | SQL> = {
      name: supplier.name,
      telephone: supplier.telephone,
      url: supplier.url,
      note: supplier.note,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy ? [dir(fieldMap[sortBy])] : [asc(supplier.name)];

    const where = and(
      eq(supplier.organizationId, organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            SUPPLIER_STRING_FILTER_FIELDS,
            SUPPLIER_DATE_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(supplier.name, `%${value}%`),
          ilike(supplier.telephone, `%${value}%`),
          ilike(supplier.url, `%${value}%`),
          ilike(supplier.note, `%${value}%`),
          ilike(localTimeText(supplier.createdAt), `%${value}%`),
          ilike(localTimeText(supplier.updatedAt), `%${value}%`),
        ],
      }),
    );

    const [data, [{ total }]] = await Promise.all([
      this.db.query.supplier.findMany({ where, orderBy, limit, offset }),
      this.db.select({ total: count() }).from(supplier).where(where),
    ]);

    const ingredients = await this.ingredientsOf(data.map(({ id }) => id));

    return {
      data: data.map((row) => ({
        ...row,
        ingredients: ingredients.get(row.id) ?? [],
      })),
      total,
    };
  }

  private async ingredientsOf(
    supplierIds: string[],
  ): Promise<Map<string, SupplierIngredientResponseDto[]>> {
    if (!supplierIds.length) return new Map();

    const rows = await this.db
      .select({
        id: ingredient.id,
        name: ingredient.name,
        supplierId: ingredient.supplierId,
      })
      .from(ingredient)
      .where(inArray(ingredient.supplierId, supplierIds))
      .orderBy(
        asc(
          localizedTextSql(
            ingredient.name,
            toLanguage(I18nContext.current()?.lang),
          ),
        ),
      );

    const ingredients = new Map<string, SupplierIngredientResponseDto[]>();
    for (const { supplierId, ...row } of rows) {
      if (!supplierId) continue;

      ingredients.set(supplierId, [
        ...(ingredients.get(supplierId) ?? []),
        row,
      ]);
    }

    return ingredients;
  }

  async findOne(supplierId: string): Promise<SupplierResponseDto> {
    const row = await this.db.query.supplier.findFirst({
      where: eq(supplier.id, supplierId),
    });
    if (!row) throw new NotFoundException('Supplier not found');

    return this.withIngredients(row);
  }

  async create(
    organizationSlug: string,
    { ingredientIds, ...dto }: CreateSupplierDto,
  ): Promise<SupplierResponseDto> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    await this.assertIngredientsInOrganization(ingredientIds, organizationId);

    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(supplier)
        .values({ ...dto, id: randomUUID(), organizationId })
        .returning();

      if (ingredientIds) await this.bindIngredients(tx, row.id, ingredientIds);

      return row;
    });

    return this.withIngredients(created);
  }

  async update(
    supplierId: string,
    { ingredientIds, ...dto }: UpdateSupplierDto,
  ): Promise<SupplierResponseDto> {
    const [existing] = await this.db
      .select({ organizationId: supplier.organizationId })
      .from(supplier)
      .where(eq(supplier.id, supplierId));
    if (!existing) throw new NotFoundException('Supplier not found');

    await this.assertIngredientsInOrganization(
      ingredientIds,
      existing.organizationId,
    );

    const updated = await this.db.transaction(async (tx) => {
      const [row] =
        Object.keys(dto).length || ingredientIds
          ? await tx
              .update(supplier)
              .set({ ...dto, updatedAt: new Date() })
              .where(eq(supplier.id, supplierId))
              .returning()
          : await tx.select().from(supplier).where(eq(supplier.id, supplierId));
      if (!row) throw new NotFoundException('Supplier not found');

      if (ingredientIds)
        await this.bindIngredients(tx, supplierId, ingredientIds);

      return row;
    });

    return this.withIngredients(updated);
  }

  private async withIngredients(
    row: typeof supplier.$inferSelect,
  ): Promise<SupplierResponseDto> {
    const ingredients = await this.ingredientsOf([row.id]);

    return { ...row, ingredients: ingredients.get(row.id) ?? [] };
  }

  private async assertIngredientsInOrganization(
    ingredientIds: string[] | undefined,
    organizationId: string,
  ): Promise<void> {
    const unique = [...new Set(ingredientIds)];
    if (!unique.length) return;

    const found = await this.db
      .select({ id: ingredient.id })
      .from(ingredient)
      .where(
        and(
          inArray(ingredient.id, unique),
          eq(ingredient.organizationId, organizationId),
        ),
      );
    if (found.length !== unique.length)
      throw new NotFoundException('Ingredient not found');
  }

  private async bindIngredients(
    tx: Tx,
    supplierId: string,
    ingredientIds: string[],
  ): Promise<void> {
    await tx
      .update(ingredient)
      .set({ supplierId: null })
      .where(
        and(
          eq(ingredient.supplierId, supplierId),
          ingredientIds.length
            ? notInArray(ingredient.id, ingredientIds)
            : undefined,
        ),
      );

    if (!ingredientIds.length) return;

    await tx
      .update(ingredient)
      .set({ supplierId })
      .where(
        and(
          inArray(ingredient.id, ingredientIds),
          or(
            isNull(ingredient.supplierId),
            ne(ingredient.supplierId, supplierId),
          ),
        ),
      );
  }

  async remove(supplierId: string): Promise<void> {
    const deleted = await this.db
      .delete(supplier)
      .where(eq(supplier.id, supplierId))
      .returning({ id: supplier.id });
    if (!deleted.length) throw new NotFoundException('Supplier not found');
  }

  async removeMany(organizationId: string, ids: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(supplier)
          .where(
            and(
              eq(supplier.organizationId, organizationId),
              eq(supplier.id, id),
            ),
          )
          .returning({ id: supplier.id });
        if (!deleted.length) throw new NotFoundException('Supplier not found');
      }
    });
  }
}
