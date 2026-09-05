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
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';

import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import { getOrganizationIdBySlug } from 'src/common/utils/organizations';
import type { LocalizedText } from 'src/db/schema/enums';
import { ingredient, supplier } from 'src/db/schema/inventory';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from './dto/create-supplier.dto';
import {
  SUPPLIER_DATE_FILTER_FIELDS,
  SUPPLIER_STRING_FILTER_FIELDS,
  SupplierPaginationQueryDto,
} from './dto/supplier-pagination-query.dto';
import { SupplierResponseDto } from './dto/supplier-response.dto';

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

    const names = await this.ingredientNamesOf(data.map(({ id }) => id));

    return {
      data: data.map((row) => ({
        ...row,
        ingredientNames: names.get(row.id) ?? [],
      })),
      total,
    };
  }

  private async ingredientNamesOf(
    supplierIds: string[],
  ): Promise<Map<string, LocalizedText[]>> {
    if (!supplierIds.length) return new Map();

    const rows = await this.db
      .select({
        ingredientName: ingredient.name,
        supplierId: ingredient.supplierId,
      })
      .from(ingredient)
      .where(inArray(ingredient.supplierId, supplierIds))
      .orderBy(asc(sql`${ingredient.name}::text`));

    const names = new Map<string, LocalizedText[]>();
    for (const { ingredientName, supplierId } of rows) {
      if (!supplierId) continue;

      names.set(supplierId, [...(names.get(supplierId) ?? []), ingredientName]);
    }

    return names;
  }

  async create(
    organizationSlug: string,
    dto: CreateSupplierDto,
  ): Promise<SupplierResponseDto> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    const [created] = await this.db
      .insert(supplier)
      .values({ ...dto, id: randomUUID(), organizationId })
      .returning();

    return { ...created, ingredientNames: [] };
  }

  async update(
    supplierId: string,
    dto: UpdateSupplierDto,
  ): Promise<SupplierResponseDto> {
    const [updated] = await this.db
      .update(supplier)
      .set(dto)
      .where(eq(supplier.id, supplierId))
      .returning();
    if (!updated) throw new NotFoundException('Supplier not found');

    const names = await this.ingredientNamesOf([supplierId]);

    return { ...updated, ingredientNames: names.get(supplierId) ?? [] };
  }

  async remove(supplierId: string): Promise<void> {
    const deleted = await this.db
      .delete(supplier)
      .where(eq(supplier.id, supplierId))
      .returning({ id: supplier.id });
    if (!deleted.length) throw new NotFoundException('Supplier not found');
  }
}
