import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';

import { startDeletedRecordBatch } from 'src/deleted-records/request-batch';
import { COMPATIBLE_UNIT_CODES } from 'src/common/constants/units';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import {
  getOrganizationBySlug,
  getOrganizationCurrency,
  getOrganizationIdBySlug,
} from 'src/common/utils/organizations';
import { ingredient, supplier, type Ingredient } from 'src/db/schema/inventory';
import { organization } from 'src/db/schema/organizations';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import {
  CreateIngredientDto,
  UpdateIngredientDto,
} from './dto/create-ingredient.dto';
import {
  INGREDIENT_DATE_FILTER_FIELDS,
  INGREDIENT_ENUM_FILTER_FIELDS,
  INGREDIENT_NUMBER_FILTER_FIELDS,
  INGREDIENT_STRING_FILTER_FIELDS,
  IngredientPaginationQueryDto,
} from './dto/ingredient-pagination-query.dto';
import { IngredientResponseDto } from './dto/ingredient-response.dto';
import { InventoryTransactionsService } from './inventory-transactions.service';
import { packageBaseQuantitySql, pricingOf, unitPriceSql } from './pricing';

const PURCHASING_FIELDS = [
  'price',
  'unitPrice',
  'supplierId',
  'supplierName',
  'url',
];

const omitPurchasing = (dto: IngredientResponseDto): IngredientResponseDto => ({
  ...dto,
  price: undefined,
  supplierId: undefined,
  supplierName: undefined,
  unitPrice: undefined,
  url: undefined,
});

@Injectable()
export class IngredientsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
  ) {}

  async findAll(
    organizationSlug: string,
    query: IngredientPaginationQueryDto = {},
    canReadPurchasing = true,
  ): Promise<{ data: IngredientResponseDto[]; total: number }> {
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
    // 成本欄位剝掉後仍能被排序與篩選反推，兩條路要一起封
    if (
      !canReadPurchasing &&
      [sortBy, filterField].some(
        (field) => field && PURCHASING_FIELDS.includes(field),
      )
    )
      throw new ForbiddenException();

    const { id: organizationId, currency: priceCurrency } =
      await getOrganizationBySlug(this.db, organizationSlug);

    const supplierName = sql`(select ${supplier.name} from ${supplier} where ${supplier.id} = ${ingredient.supplierId})`;

    const fieldMap: Record<string, Column | SQL> = {
      name: sql`${ingredient.name}::text`,
      brand: ingredient.brand,
      supplierName,
      note: ingredient.note,
      unitCode: sql`${ingredient.unitCode}::text`,
      inventoryLevel: ingredient.inventoryLevel,
      lowStockThreshold: ingredient.lowStockThreshold,
      createdAt: ingredient.createdAt,
      updatedAt: ingredient.updatedAt,
      price: ingredient.price,
      eligibleQuantity: packageBaseQuantitySql,
      unitPrice: unitPriceSql,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [dir(fieldMap[sortBy])]
      : [asc(ingredient.sortOrder), asc(sql`${ingredient.name}::text`)];

    const where = and(
      eq(ingredient.organizationId, organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            INGREDIENT_STRING_FILTER_FIELDS,
            INGREDIENT_DATE_FILTER_FIELDS,
            INGREDIENT_ENUM_FILTER_FIELDS,
            INGREDIENT_NUMBER_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: INGREDIENT_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(sql`${ingredient.name}::text`, `%${value}%`),
          ilike(ingredient.brand, `%${value}%`),
          ...(canReadPurchasing
            ? [
                ilike(supplierName, `%${value}%`),
                ilike(ingredient.url, `%${value}%`),
              ]
            : []),
          ilike(ingredient.note, `%${value}%`),
          ilike(sql`${ingredient.inventoryLevel}::text`, `%${value}%`),
          ilike(sql`${ingredient.lowStockThreshold}::text`, `%${value}%`),
          ilike(localTimeText(ingredient.createdAt), `%${value}%`),
          ilike(localTimeText(ingredient.updatedAt), `%${value}%`),
        ],
      }),
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ ingredient, supplierName: supplier.name })
        .from(ingredient)
        .leftJoin(supplier, eq(supplier.id, ingredient.supplierId))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(ingredient).where(where),
    ]);

    return {
      data: rows.map(({ ingredient: row, supplierName: name }) => {
        const dto = {
          ...row,
          supplierName: name,
          priceCurrency,
          ...pricingOf(row),
        };

        return canReadPurchasing ? dto : omitPurchasing(dto);
      }),
      total,
    };
  }

  async reorder(
    organizationSlug: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(ingredient)
          .set({ sortOrder: offset + i })
          .where(
            and(
              eq(ingredient.id, id),
              eq(ingredient.organizationId, organizationId),
            ),
          );
      }
    });
  }

  private async supplierNameOf(
    supplierId: string | null,
  ): Promise<string | null> {
    if (!supplierId) return null;

    const [found] = await this.db
      .select({ name: supplier.name })
      .from(supplier)
      .where(eq(supplier.id, supplierId));

    return found?.name ?? null;
  }

  async findOne(
    ingredientId: string,
    canReadPurchasing = true,
  ): Promise<IngredientResponseDto> {
    const found = await this.db.query.ingredient.findFirst({
      where: eq(ingredient.id, ingredientId),
    });
    if (!found) throw new NotFoundException('Ingredient not found');

    const [supplierName, priceCurrency] = await Promise.all([
      this.supplierNameOf(found.supplierId),
      getOrganizationCurrency(this.db, found.organizationId),
    ]);

    const dto = { ...found, supplierName, priceCurrency, ...pricingOf(found) };

    return canReadPurchasing ? dto : omitPurchasing(dto);
  }

  async create(
    organizationSlug: string,
    { inventoryLevel, transactionNote, ...dto }: CreateIngredientDto,
  ): Promise<IngredientResponseDto> {
    const { id: organizationId, currency: priceCurrency } =
      await getOrganizationBySlug(this.db, organizationSlug);

    this.assertCompatibleUnitCode(dto);
    await this.assertSupplierInOrganization(dto.supplierId, organizationId);

    const created = await this.db.transaction(async (tx) => {
      await tx
        .update(ingredient)
        .set({ sortOrder: sql`${ingredient.sortOrder} + 1` })
        .where(eq(ingredient.organizationId, organizationId));

      const [row] = await tx
        .insert(ingredient)
        .values({ ...dto, id: randomUUID(), organizationId, sortOrder: 0 })
        .returning();

      if (!inventoryLevel || !Number(inventoryLevel)) return row;

      await this.inventoryTransactionsService.create(
        row.id,
        { inventoryLevel, note: transactionNote },
        { tx },
      );

      return { ...row, inventoryLevel };
    });

    return {
      ...created,
      supplierName: await this.supplierNameOf(created.supplierId),
      priceCurrency,
      ...pricingOf(created),
    };
  }

  async update(
    ingredientId: string,
    { inventoryLevel, transactionNote, ...dto }: UpdateIngredientDto,
  ): Promise<IngredientResponseDto> {
    const [existing] = await this.db
      .select({
        eligibleQuantityUnitCode: ingredient.eligibleQuantityUnitCode,
        organizationId: ingredient.organizationId,
        priceCurrency: organization.currency,
        unitCode: ingredient.unitCode,
      })
      .from(ingredient)
      .innerJoin(organization, eq(organization.id, ingredient.organizationId))
      .where(eq(ingredient.id, ingredientId));
    if (!existing) throw new NotFoundException('Ingredient not found');

    this.assertCompatibleUnitCode({ ...existing, ...dto });
    this.assertPackageNotCleared(dto);
    await this.assertSupplierInOrganization(
      dto.supplierId,
      existing.organizationId,
    );

    const updated = await this.db.transaction(async (tx) => {
      const [row] = Object.keys(dto).length
        ? await tx
            .update(ingredient)
            .set(dto)
            .where(eq(ingredient.id, ingredientId))
            .returning()
        : await tx
            .select()
            .from(ingredient)
            .where(eq(ingredient.id, ingredientId))
            .for('update');
      if (!row) throw new NotFoundException('Ingredient not found');

      // 帳上數量要拿交易內鎖定的值比，交易外讀到的可能已被出餐扣庫存蓋過
      if (
        inventoryLevel == null ||
        Number(inventoryLevel) === Number(row.inventoryLevel)
      )
        return row;

      await this.inventoryTransactionsService.create(
        row.id,
        { inventoryLevel, note: transactionNote },
        { tx },
      );

      return { ...row, inventoryLevel };
    });

    return {
      ...updated,
      supplierName: await this.supplierNameOf(updated.supplierId),
      priceCurrency: existing.priceCurrency,
      ...pricingOf(updated),
    };
  }

  async remove(ingredientId: string): Promise<void> {
    const deleted = await this.db
      .delete(ingredient)
      .where(eq(ingredient.id, ingredientId))
      .returning({ id: ingredient.id });
    if (!deleted.length) throw new NotFoundException('Ingredient not found');
  }

  async removeMany(organizationId: string, ids: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(ingredient)
          .where(
            and(
              eq(ingredient.organizationId, organizationId),
              eq(ingredient.id, id),
            ),
          )
          .returning({ id: ingredient.id });
        if (!deleted.length)
          throw new NotFoundException('Ingredient not found');
      }
    });
  }

  private async assertSupplierInOrganization(
    supplierId: string | null | undefined,
    organizationId: string,
  ): Promise<void> {
    if (!supplierId) return;

    const [found] = await this.db
      .select({ id: supplier.id })
      .from(supplier)
      .where(
        and(
          eq(supplier.id, supplierId),
          eq(supplier.organizationId, organizationId),
        ),
      );
    if (!found) throw new NotFoundException('Supplier not found');
  }

  // PartialType 讓每個欄位都吃 @IsOptional，null 會跳過驗證直接清掉包裝規格
  private assertPackageNotCleared({
    eligibleQuantity,
    eligibleQuantityUnitCode,
    price,
    unitCode,
  }: UpdateIngredientDto): void {
    if (
      [eligibleQuantity, eligibleQuantityUnitCode, price, unitCode].every(
        (value) => value === undefined || value,
      )
    )
      return;

    throw new BadRequestException(
      'Package quantity, its unit, price, currency and base unit are all required',
    );
  }

  private assertCompatibleUnitCode({
    eligibleQuantityUnitCode,
    unitCode,
  }: Partial<Pick<Ingredient, 'eligibleQuantityUnitCode' | 'unitCode'>>): void {
    if (!eligibleQuantityUnitCode || !unitCode) return;

    if (!COMPATIBLE_UNIT_CODES[unitCode].includes(eligibleQuantityUnitCode)) {
      throw new BadRequestException(
        `Package unit ${eligibleQuantityUnitCode} is not compatible with ingredient unit ${unitCode}`,
      );
    }
  }
}
