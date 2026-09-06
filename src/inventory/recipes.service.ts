import {
  ConflictException,
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
  inArray,
  max,
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
import {
  ingredient,
  recipe,
  recipeIngredient,
  type Ingredient,
  type Recipe,
  type RecipeIngredient,
} from 'src/db/schema/inventory';
import { menuItem, offer } from 'src/db/schema/menus';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import {
  CreateRecipeDto,
  CreateRecipeIngredientDto,
  UpdateRecipeDto,
  UpdateRecipeIngredientDto,
} from './dto/create-recipe.dto';
import {
  RECIPE_INGREDIENT_DATE_FILTER_FIELDS,
  RECIPE_INGREDIENT_NUMBER_FILTER_FIELDS,
  RECIPE_INGREDIENT_STRING_FILTER_FIELDS,
  RecipeIngredientPaginationQueryDto,
} from './dto/recipe-ingredient-pagination-query.dto';
import {
  RECIPE_DATE_FILTER_FIELDS,
  RECIPE_NUMBER_FILTER_FIELDS,
  RECIPE_STRING_FILTER_FIELDS,
  RecipePaginationQueryDto,
} from './dto/recipe-pagination-query.dto';
import {
  RecipeIngredientResponseDto,
  RecipeResponseDto,
} from './dto/recipe-response.dto';
import { unitPriceOf } from './pricing';
import { bindMenuItemByRecipeName } from './recipe-menu-item-binding';

const totalCostOf = (
  materials: RecipeIngredientResponseDto[],
): number | null =>
  materials.some(({ cost }) => cost == null)
    ? null
    : materials.reduce((sum, { cost }) => sum + (cost ?? 0), 0);

@Injectable()
export class RecipesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll(
    organizationSlug: string,
    query: RecipePaginationQueryDto = {},
    canReadPurchasing = true,
  ): Promise<{ data: RecipeResponseDto[]; total: number }> {
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
      name: sql`${recipe.name}::text`,
      recipeYield: recipe.recipeYield,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [dir(fieldMap[sortBy])]
      : [asc(sql`${recipe.name}::text`)];

    const where = and(
      eq(recipe.organizationId, organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            RECIPE_STRING_FILTER_FIELDS,
            RECIPE_DATE_FILTER_FIELDS,
            [],
            RECIPE_NUMBER_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(sql`${recipe.name}::text`, `%${value}%`),
          ilike(localTimeText(recipe.createdAt), `%${value}%`),
          ilike(localTimeText(recipe.updatedAt), `%${value}%`),
        ],
      }),
    );

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(recipe)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(recipe).where(where),
    ]);

    return { data: await this.toResponse(data, canReadPurchasing), total };
  }

  async findOne(
    recipeId: string,
    canReadPurchasing = true,
  ): Promise<RecipeResponseDto> {
    const found = await this.db.query.recipe.findFirst({
      where: eq(recipe.id, recipeId),
    });
    if (!found) throw new NotFoundException('Recipe not found');

    const materials = await this.materialsOf([recipeId], canReadPurchasing);
    const [response] = await this.toResponse(
      [found],
      canReadPurchasing,
      materials,
    );

    return { ...response, recipeIngredients: materials.get(recipeId) ?? [] };
  }

  async create(
    organizationSlug: string,
    dto: CreateRecipeDto,
  ): Promise<RecipeResponseDto> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(recipe)
        .values({ ...dto, id: randomUUID(), organizationId })
        .returning();

      if (dto.menuItemId !== undefined) return row;

      const menuItemId = await bindMenuItemByRecipeName(tx, {
        name: row.name,
        organizationId,
        recipeId: row.id,
      });

      return { ...row, menuItemId };
    });

    const [response] = await this.toResponse([created], true);

    return response;
  }

  async update(
    recipeId: string,
    dto: UpdateRecipeDto,
  ): Promise<RecipeResponseDto> {
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(recipe)
        .set(dto)
        .where(eq(recipe.id, recipeId))
        .returning();
      if (!row) throw new NotFoundException('Recipe not found');

      if (dto.menuItemId !== undefined || row.menuItemId) return row;

      const menuItemId = await bindMenuItemByRecipeName(tx, {
        name: row.name,
        organizationId: row.organizationId,
        recipeId: row.id,
      });

      return { ...row, menuItemId };
    });

    const [response] = await this.toResponse([updated], true);

    return response;
  }

  async remove(recipeId: string): Promise<void> {
    const deleted = await this.db
      .delete(recipe)
      .where(eq(recipe.id, recipeId))
      .returning({ id: recipe.id });
    if (!deleted.length) throw new NotFoundException('Recipe not found');
  }

  async findAllIngredients(
    recipeId: string,
    query: RecipeIngredientPaginationQueryDto = {},
    canReadPurchasing = true,
  ): Promise<{ data: RecipeIngredientResponseDto[]; total: number }> {
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
      ingredientName: sql`${ingredient.name}::text`,
      requiredQuantity: recipeIngredient.requiredQuantity,
      createdAt: recipeIngredient.createdAt,
      updatedAt: recipeIngredient.updatedAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [dir(fieldMap[sortBy])]
      : [asc(recipeIngredient.sortOrder), asc(recipeIngredient.createdAt)];

    const where = and(
      eq(recipeIngredient.recipeId, recipeId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            RECIPE_INGREDIENT_STRING_FILTER_FIELDS,
            RECIPE_INGREDIENT_DATE_FILTER_FIELDS,
            undefined,
            RECIPE_INGREDIENT_NUMBER_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(sql`${ingredient.name}::text`, `%${value}%`),
          ilike(sql`${recipeIngredient.requiredQuantity}::text`, `%${value}%`),
          ilike(localTimeText(recipeIngredient.createdAt), `%${value}%`),
          ilike(localTimeText(recipeIngredient.updatedAt), `%${value}%`),
        ],
      }),
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ material: recipeIngredient, ingredient })
        .from(recipeIngredient)
        .innerJoin(ingredient, eq(recipeIngredient.ingredientId, ingredient.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(recipeIngredient)
        .innerJoin(ingredient, eq(recipeIngredient.ingredientId, ingredient.id))
        .where(where),
    ]);

    return { data: this.priced(rows, canReadPurchasing), total };
  }

  // 同一食材重複成兩列時，consume() 會依每一列各扣一次庫存
  private async assertIngredientNotUsed(
    recipeId: string,
    ingredientId: string | undefined,
    exceptId?: string,
  ): Promise<void> {
    if (!ingredientId) return;

    const duplicates = await this.db
      .select({ id: recipeIngredient.id })
      .from(recipeIngredient)
      .where(
        and(
          eq(recipeIngredient.recipeId, recipeId),
          eq(recipeIngredient.ingredientId, ingredientId),
        ),
      );

    if (duplicates.some(({ id }) => id !== exceptId)) {
      throw new ConflictException('Ingredient is already in this recipe');
    }
  }

  private async guardDuplicate<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === '23505')
        throw new ConflictException('Ingredient is already in this recipe');
      throw error;
    }
  }

  async createIngredient(
    recipeId: string,
    dto: CreateRecipeIngredientDto,
  ): Promise<RecipeIngredientResponseDto> {
    await this.assertIngredientNotUsed(recipeId, dto.ingredientId);

    const [{ maxSortOrder }] = await this.db
      .select({ maxSortOrder: max(recipeIngredient.sortOrder) })
      .from(recipeIngredient)
      .where(eq(recipeIngredient.recipeId, recipeId));

    const [created] = await this.guardDuplicate(() =>
      this.db
        .insert(recipeIngredient)
        .values({
          ...dto,
          id: randomUUID(),
          recipeId,
          sortOrder: dto.sortOrder ?? (maxSortOrder ?? -1) + 1,
        })
        .returning(),
    );

    return this.toMaterial(created.id);
  }

  async updateIngredient(
    recipeIngredientId: string,
    dto: UpdateRecipeIngredientDto,
  ): Promise<RecipeIngredientResponseDto> {
    const [existing] = await this.db
      .select({ recipeId: recipeIngredient.recipeId })
      .from(recipeIngredient)
      .where(eq(recipeIngredient.id, recipeIngredientId));
    if (!existing) throw new NotFoundException('Recipe ingredient not found');

    await this.assertIngredientNotUsed(
      existing.recipeId,
      dto.ingredientId,
      recipeIngredientId,
    );

    const [updated] = await this.guardDuplicate(() =>
      this.db
        .update(recipeIngredient)
        .set(dto)
        .where(eq(recipeIngredient.id, recipeIngredientId))
        .returning(),
    );
    if (!updated) throw new NotFoundException('Recipe ingredient not found');

    return this.toMaterial(updated.id);
  }

  async removeIngredient(recipeIngredientId: string): Promise<void> {
    const deleted = await this.db
      .delete(recipeIngredient)
      .where(eq(recipeIngredient.id, recipeIngredientId))
      .returning({ id: recipeIngredient.id });
    if (!deleted.length)
      throw new NotFoundException('Recipe ingredient not found');
  }

  private async toMaterial(
    recipeIngredientId: string,
  ): Promise<RecipeIngredientResponseDto> {
    const [row] = await this.db
      .select({ recipeId: recipeIngredient.recipeId })
      .from(recipeIngredient)
      .where(eq(recipeIngredient.id, recipeIngredientId));

    const materials = await this.materialsOf([row.recipeId], true);
    const material = materials
      .get(row.recipeId)
      ?.find(({ id }) => id === recipeIngredientId);
    if (!material) throw new NotFoundException('Recipe ingredient not found');

    return material;
  }

  private async toResponse(
    recipes: Recipe[],
    canReadPurchasing: boolean,
    loaded?: Map<string, RecipeIngredientResponseDto[]>,
  ): Promise<RecipeResponseDto[]> {
    const materials =
      loaded ??
      (await this.materialsOf(
        recipes.map(({ id }) => id),
        canReadPurchasing,
      ));
    const prices = await this.pricesOf(
      recipes.flatMap(({ menuItemId }) => menuItemId ?? []),
    );
    const menuItemNames = await this.menuItemNamesOf(
      recipes.flatMap(({ menuItemId }) => menuItemId ?? []),
    );

    return recipes.map((row) => ({
      ...row,
      ...(canReadPurchasing && {
        cost: totalCostOf(materials.get(row.id) ?? []),
      }),
      menuItemName: row.menuItemId
        ? (menuItemNames.get(row.menuItemId) ?? null)
        : null,
      price: row.menuItemId ? (prices.get(row.menuItemId) ?? null) : null,
    }));
  }

  async costsOf(
    recipeIds: string[],
    canReadPurchasing = true,
  ): Promise<Map<string, number | null>> {
    if (!canReadPurchasing) return new Map();

    const materials = await this.materialsOf(recipeIds, canReadPurchasing);

    return new Map(
      recipeIds.map((recipeId) => [
        recipeId,
        totalCostOf(materials.get(recipeId) ?? []),
      ]),
    );
  }

  private async materialsOf(
    recipeIds: string[],
    canReadPurchasing: boolean,
  ): Promise<Map<string, RecipeIngredientResponseDto[]>> {
    if (!recipeIds.length) return new Map();

    const rows = await this.db
      .select({ material: recipeIngredient, ingredient })
      .from(recipeIngredient)
      .innerJoin(ingredient, eq(recipeIngredient.ingredientId, ingredient.id))
      .where(inArray(recipeIngredient.recipeId, recipeIds))
      .orderBy(
        asc(recipeIngredient.sortOrder),
        asc(recipeIngredient.createdAt),
      );

    const priced = this.priced(rows, canReadPurchasing);

    const materials = new Map<string, RecipeIngredientResponseDto[]>();
    for (const material of priced) {
      const list = materials.get(material.recipeId) ?? [];

      list.push(material);
      materials.set(material.recipeId, list);
    }

    return materials;
  }

  private priced(
    rows: { material: RecipeIngredient; ingredient: Ingredient }[],
    canReadPurchasing: boolean,
  ): RecipeIngredientResponseDto[] {
    return rows.map(({ material, ingredient: source }) => {
      const unitPrice = unitPriceOf(source);

      return {
        ...material,
        ...(canReadPurchasing && {
          cost:
            unitPrice === null
              ? null
              : Number(material.requiredQuantity) * unitPrice,
          unitPrice,
        }),
        ingredientName: source.name,
        unitCode: source.unitCode,
      };
    });
  }

  private async pricesOf(menuItemIds: string[]): Promise<Map<string, number>> {
    if (!menuItemIds.length) return new Map();

    const offers = await this.db
      .select()
      .from(offer)
      .where(inArray(offer.menuItemId, menuItemIds))
      .orderBy(asc(offer.createdAt));

    const prices = new Map<string, number>();
    for (const row of offers) {
      if (row.menuItemId && row.price && !prices.has(row.menuItemId))
        prices.set(row.menuItemId, Number(row.price));
    }

    return prices;
  }

  private async menuItemNamesOf(
    menuItemIds: string[],
  ): Promise<Map<string, LocalizedText>> {
    if (!menuItemIds.length) return new Map();

    const rows = await this.db
      .select({ id: menuItem.id, name: menuItem.name })
      .from(menuItem)
      .where(inArray(menuItem.id, menuItemIds));

    return new Map(rows.map(({ id, name }) => [id, name]));
  }
}
