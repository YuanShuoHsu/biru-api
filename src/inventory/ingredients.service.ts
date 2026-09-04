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
  max,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';

import { UNIT_FACTORS } from 'src/common/constants/units';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import { getOrganizationIdBySlug } from 'src/common/utils/organizations';
import {
  ingredient,
  ingredientOffer,
  supplier,
  type IngredientOffer,
} from 'src/db/schema/inventory';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import {
  CreateIngredientOfferDto,
  UpdateIngredientOfferDto,
} from './dto/create-ingredient-offer.dto';
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
import {
  IngredientOfferResponseDto,
  IngredientResponseDto,
} from './dto/ingredient-response.dto';

export const unitPriceOf = ({
  eligibleQuantity,
  eligibleQuantityUnitCode,
  price,
}: Pick<
  IngredientOffer,
  'eligibleQuantity' | 'eligibleQuantityUnitCode' | 'price'
>): number =>
  Number(price) /
  (Number(eligibleQuantity) * UNIT_FACTORS[eligibleQuantityUnitCode]);

@Injectable()
export class IngredientsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll(
    organizationSlug: string,
    query: IngredientPaginationQueryDto = {},
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
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    const fieldMap: Record<string, Column | SQL> = {
      name: sql`${ingredient.name}::text`,
      brand: ingredient.brand,
      unitCode: sql`${ingredient.unitCode}::text`,
      inventoryLevel: ingredient.inventoryLevel,
      lowStockThreshold: ingredient.lowStockThreshold,
      createdAt: ingredient.createdAt,
      updatedAt: ingredient.updatedAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [dir(fieldMap[sortBy])]
      : [asc(sql`${ingredient.name}::text`)];

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
          ilike(ingredient.inventoryLevel, `%${value}%`),
          ilike(localTimeText(ingredient.createdAt), `%${value}%`),
          ilike(localTimeText(ingredient.updatedAt), `%${value}%`),
        ],
      }),
    );

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(ingredient)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(ingredient).where(where),
    ]);

    const unitPrices = await this.unitPricesOf(data.map(({ id }) => id));

    return {
      data: data.map((row) => ({
        ...row,
        unitPrice: unitPrices.get(row.id) ?? null,
      })),
      total,
    };
  }

  async findOne(ingredientId: string): Promise<IngredientResponseDto> {
    const found = await this.db.query.ingredient.findFirst({
      where: eq(ingredient.id, ingredientId),
    });
    if (!found) throw new NotFoundException('Ingredient not found');

    const unitPrices = await this.unitPricesOf([ingredientId]);

    return { ...found, unitPrice: unitPrices.get(ingredientId) ?? null };
  }

  async create(
    organizationSlug: string,
    dto: CreateIngredientDto,
  ): Promise<IngredientResponseDto> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    const [created] = await this.db
      .insert(ingredient)
      .values({ ...dto, id: randomUUID(), organizationId })
      .returning();

    return { ...created, unitPrice: null };
  }

  async update(
    ingredientId: string,
    dto: UpdateIngredientDto,
  ): Promise<IngredientResponseDto> {
    const [updated] = await this.db
      .update(ingredient)
      .set(dto)
      .where(eq(ingredient.id, ingredientId))
      .returning();
    if (!updated) throw new NotFoundException('Ingredient not found');

    const unitPrices = await this.unitPricesOf([ingredientId]);

    return { ...updated, unitPrice: unitPrices.get(ingredientId) ?? null };
  }

  async remove(ingredientId: string): Promise<void> {
    const deleted = await this.db
      .delete(ingredient)
      .where(eq(ingredient.id, ingredientId))
      .returning({ id: ingredient.id });
    if (!deleted.length) throw new NotFoundException('Ingredient not found');
  }

  async findAllOffers(
    ingredientId: string,
  ): Promise<IngredientOfferResponseDto[]> {
    const rows = await this.db
      .select({ offer: ingredientOffer, supplierName: supplier.name })
      .from(ingredientOffer)
      .leftJoin(supplier, eq(ingredientOffer.supplierId, supplier.id))
      .where(eq(ingredientOffer.ingredientId, ingredientId))
      .orderBy(asc(ingredientOffer.sortOrder), asc(ingredientOffer.createdAt));

    return rows.map(({ offer, supplierName }) => ({
      ...offer,
      supplierName,
      unitPrice: unitPriceOf(offer),
    }));
  }

  async createOffer(
    ingredientId: string,
    dto: CreateIngredientOfferDto,
  ): Promise<IngredientOfferResponseDto> {
    const [{ maxSortOrder }] = await this.db
      .select({ maxSortOrder: max(ingredientOffer.sortOrder) })
      .from(ingredientOffer)
      .where(eq(ingredientOffer.ingredientId, ingredientId));

    const [created] = await this.db
      .insert(ingredientOffer)
      .values({
        ...dto,
        id: randomUUID(),
        ingredientId,
        sortOrder: dto.sortOrder ?? (maxSortOrder ?? -1) + 1,
      })
      .returning();

    return { ...created, supplierName: null, unitPrice: unitPriceOf(created) };
  }

  async updateOffer(
    ingredientOfferId: string,
    dto: UpdateIngredientOfferDto,
  ): Promise<IngredientOfferResponseDto> {
    const [updated] = await this.db
      .update(ingredientOffer)
      .set(dto)
      .where(eq(ingredientOffer.id, ingredientOfferId))
      .returning();
    if (!updated) throw new NotFoundException('Ingredient offer not found');

    return { ...updated, supplierName: null, unitPrice: unitPriceOf(updated) };
  }

  async removeOffer(ingredientOfferId: string): Promise<void> {
    const deleted = await this.db
      .delete(ingredientOffer)
      .where(eq(ingredientOffer.id, ingredientOfferId))
      .returning({ id: ingredientOffer.id });
    if (!deleted.length)
      throw new NotFoundException('Ingredient offer not found');
  }

  private async unitPricesOf(
    ingredientIds: string[],
  ): Promise<Map<string, number>> {
    if (!ingredientIds.length) return new Map();

    const offers = await this.db
      .select()
      .from(ingredientOffer)
      .where(inArray(ingredientOffer.ingredientId, ingredientIds))
      .orderBy(asc(ingredientOffer.sortOrder), asc(ingredientOffer.createdAt));

    const unitPrices = new Map<string, number>();
    for (const offer of offers) {
      if (!unitPrices.has(offer.ingredientId))
        unitPrices.set(offer.ingredientId, unitPriceOf(offer));
    }

    return unitPrices;
  }
}
