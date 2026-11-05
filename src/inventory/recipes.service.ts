import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { randomUUID } from 'crypto';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  max,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';

import { startDeletedRecordBatch } from '../deleted-records/request-batch.js';
import { COMPATIBLE_UNIT_CODES } from '../common/constants/units.js';
import {
  buildFilterCondition,
  buildLocalizedTextFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from '../common/utils/data-grid-filters.js';
import { toLanguage } from '../common/utils/language.js';
import { localizedTextSql } from '../common/utils/localized-text.js';
import {
  isCheckViolation,
  isUniqueViolation,
  pgConstraint,
} from '../common/utils/pg-errors.js';
import type { LocalizedText } from '../db/schema/enums.js';
import {
  ingredient,
  recipe,
  recipeIngredient,
  type Ingredient,
  type Recipe,
  type RecipeIngredient,
} from '../db/schema/inventory.js';
import {
  menu,
  menuItem,
  modifier,
  modifierGroup,
  offer,
} from '../db/schema/menus.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import { notFoundError as menuNotFoundError } from '../menus/menu-errors.js';

import {
  CreateRecipeDto,
  CreateRecipeIngredientDto,
  UpdateRecipeDto,
  UpdateRecipeIngredientDto,
} from './dto/create-recipe.dto.js';
import {
  RECIPE_INGREDIENT_DATE_FILTER_FIELDS,
  RECIPE_INGREDIENT_NUMBER_FILTER_FIELDS,
  RECIPE_INGREDIENT_STRING_FILTER_FIELDS,
  RecipeIngredientPaginationQueryDto,
} from './dto/recipe-ingredient-pagination-query.dto.js';
import {
  RECIPE_DATE_FILTER_FIELDS,
  RECIPE_NUMBER_FILTER_FIELDS,
  RECIPE_STRING_FILTER_FIELDS,
  RecipePaginationQueryDto,
} from './dto/recipe-pagination-query.dto.js';
import {
  RecipeIngredientResponseDto,
  RecipeResponseDto,
} from './dto/recipe-response.dto.js';
import {
  badRequestError,
  conflictError,
  notFoundError,
} from './inventory-errors.js';
import { unitPriceSql } from './pricing.js';
import { bindMenuItemByRecipeName } from './recipe-menu-item-binding.js';

const totalCostOf = (
  materials: RecipeIngredientResponseDto[],
): number | null =>
  materials.length === 0 || materials.some(({ cost }) => cost == null)
    ? null
    : materials.reduce((sum, { cost }) => sum + (cost ?? 0), 0);

const PURCHASING_FIELDS: string[] = ['unitPrice', 'cost'];

const rethrowBindingConflict = (error: unknown): never => {
  const constraint = pgConstraint(error);
  if (isUniqueViolation(error) && constraint === 'recipe_menuItemId_uidx')
    throw conflictError('recipeMenuItemTaken');
  if (isUniqueViolation(error) && constraint === 'recipe_modifierId_uidx')
    throw conflictError('recipeModifierTaken');
  if (
    isCheckViolation(error) &&
    constraint === 'recipe_menuItemId_modifierId_check'
  )
    throw conflictError('recipeMenuItemAndModifier');
  throw error;
};

@Injectable()
export class RecipesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll(
    organizationId: string,
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
      hasMenuItem,
    } = query;

    const fieldMap: Record<string, Column | SQL> = {
      recipeYield: recipe.recipeYield,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
    };

    const localizedName = localizedTextSql(
      recipe.name,
      toLanguage(I18nContext.current()?.lang),
    );
    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [dir(sortBy === 'name' ? localizedName : fieldMap[sortBy])]
      : [asc(localizedName)];

    const where = and(
      eq(recipe.organizationId, organizationId),
      hasMenuItem === undefined
        ? undefined
        : hasMenuItem
          ? isNotNull(recipe.menuItemId)
          : isNull(recipe.menuItemId),
      filterField === 'name' && filterOperator
        ? buildLocalizedTextFilterCondition(
            recipe.name,
            filterOperator,
            filterValue,
          )
        : filterField && filterOperator
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
          buildLocalizedTextFilterCondition(recipe.name, 'contains', value),
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

  private async detailOf(
    found: typeof recipe.$inferSelect,
    canReadPurchasing: boolean,
  ): Promise<RecipeResponseDto> {
    const materials = await this.materialsOf([found.id], canReadPurchasing);
    const [response] = await this.toResponse(
      [found],
      canReadPurchasing,
      materials,
    );

    return Object.assign(response, {
      recipeIngredients: materials.get(found.id) ?? [],
    });
  }

  async findOne(
    recipeId: string,
    canReadPurchasing = true,
  ): Promise<RecipeResponseDto> {
    const found = await this.db.query.recipe.findFirst({
      where: eq(recipe.id, recipeId),
    });
    if (!found) throw notFoundError('recipeNotFound');

    return this.detailOf(found, canReadPurchasing);
  }

  async findOneByMenuItem(
    menuItemId: string,
    canReadPurchasing = true,
  ): Promise<RecipeResponseDto | null> {
    const found = await this.db.query.recipe.findFirst({
      where: eq(recipe.menuItemId, menuItemId),
    });

    return found ? this.detailOf(found, canReadPurchasing) : null;
  }

  async create(
    organizationId: string,
    { menuItemId, modifierId, ...dto }: CreateRecipeDto,
  ): Promise<RecipeResponseDto> {
    if (menuItemId && modifierId)
      throw badRequestError('recipeMenuItemAndModifier');
    if (modifierId && (dto.recipeYield ?? 1) !== 1)
      throw badRequestError('modifierRecipeYieldNotOne');
    await this.assertMenuItemInOrganization(organizationId, menuItemId);
    await this.assertModifierInOrganization(organizationId, modifierId);

    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(recipe)
        .values({
          ...dto,
          id: randomUUID(),
          menuItemId,
          modifierId,
          organizationId,
        })
        .returning()
        .catch(rethrowBindingConflict);

      if (menuItemId !== undefined || modifierId) return row;

      const boundMenuItemId = await bindMenuItemByRecipeName(tx, {
        name: row.name,
        organizationId,
        recipeId: row.id,
      });

      return { ...row, menuItemId: boundMenuItemId };
    });

    const [response] = await this.toResponse([created], true);

    return response;
  }

  async update(
    recipeId: string,
    dto: UpdateRecipeDto,
  ): Promise<RecipeResponseDto> {
    await this.assertSourceRecipeUpdate(recipeId, dto);

    const [current] = await this.db
      .select({
        menuItemId: recipe.menuItemId,
        modifierId: recipe.modifierId,
        organizationId: recipe.organizationId,
        recipeYield: recipe.recipeYield,
      })
      .from(recipe)
      .where(eq(recipe.id, recipeId));
    if (!current) throw notFoundError('recipeNotFound');

    const modifierId =
      dto.modifierId === undefined ? current.modifierId : dto.modifierId;
    const menuItemId =
      dto.menuItemId === undefined ? current.menuItemId : dto.menuItemId;
    if (menuItemId && modifierId)
      throw badRequestError('recipeMenuItemAndModifier');
    if (modifierId && (dto.recipeYield ?? current.recipeYield) !== 1)
      throw badRequestError('modifierRecipeYieldNotOne');
    await this.assertMenuItemInOrganization(
      current.organizationId,
      dto.menuItemId,
    );
    await this.assertModifierInOrganization(
      current.organizationId,
      dto.modifierId,
    );

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(recipe)
        .set(dto)
        .where(eq(recipe.id, recipeId))
        .returning()
        .catch(rethrowBindingConflict);
      if (!row) throw notFoundError('recipeNotFound');

      if (
        dto.menuItemId !== undefined ||
        dto.modifierId !== undefined ||
        row.menuItemId ||
        row.modifierId
      )
        return row;

      const boundMenuItemId = await bindMenuItemByRecipeName(tx, {
        name: row.name,
        organizationId: row.organizationId,
        recipeId: row.id,
      });

      return { ...row, menuItemId: boundMenuItemId };
    });

    const [response] = await this.toResponse([updated], true);

    return response;
  }

  async remove(recipeId: string): Promise<void> {
    const deleted = await this.db
      .delete(recipe)
      .where(eq(recipe.id, recipeId))
      .returning({ id: recipe.id });
    if (!deleted.length) throw notFoundError('recipeNotFound');
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

    if (!canReadPurchasing && sortBy && PURCHASING_FIELDS.includes(sortBy))
      throw new ForbiddenException();

    const fieldMap: Record<string, Column | SQL> = {
      requiredQuantity: recipeIngredient.requiredQuantity,
      createdAt: recipeIngredient.createdAt,
      updatedAt: recipeIngredient.updatedAt,
      unitPrice: unitPriceSql,
      cost: sql`(${recipeIngredient.requiredQuantity} * ${unitPriceSql})`,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [
          dir(
            sortBy === 'ingredientName'
              ? localizedTextSql(
                  ingredient.name,
                  toLanguage(I18nContext.current()?.lang),
                )
              : fieldMap[sortBy],
          ),
        ]
      : [asc(recipeIngredient.sortOrder), asc(recipeIngredient.createdAt)];

    const where = and(
      eq(recipeIngredient.recipeId, recipeId),
      filterField === 'ingredientName' && filterOperator
        ? buildLocalizedTextFilterCondition(
            ingredient.name,
            filterOperator,
            filterValue,
          )
        : filterField && filterOperator
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
          buildLocalizedTextFilterCondition(ingredient.name, 'contains', value),
          ilike(sql`${recipeIngredient.requiredQuantity}::text`, `%${value}%`),
          ilike(localTimeText(recipeIngredient.createdAt), `%${value}%`),
          ilike(localTimeText(recipeIngredient.updatedAt), `%${value}%`),
        ],
      }),
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          material: recipeIngredient,
          ingredient,
          unitPrice: unitPriceSql,
        })
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

  private async assertMenuItemInOrganization(
    organizationId: string,
    menuItemId: string | null | undefined,
  ): Promise<void> {
    if (!menuItemId) return;

    const [found] = await this.db
      .select({ id: menuItem.id })
      .from(menuItem)
      .innerJoin(menu, eq(menu.id, menuItem.menuId))
      .where(
        and(
          eq(menuItem.id, menuItemId),
          eq(menu.organizationId, organizationId),
        ),
      );
    if (!found) throw menuNotFoundError('menuItemNotFound');
  }

  private async assertModifierInOrganization(
    organizationId: string,
    modifierId: string | null | undefined,
  ): Promise<void> {
    if (!modifierId) return;

    const [found] = await this.db
      .select({ id: modifier.id })
      .from(modifier)
      .innerJoin(modifierGroup, eq(modifierGroup.id, modifier.modifierGroupId))
      .innerJoin(menu, eq(menu.id, modifierGroup.menuId))
      .where(
        and(
          eq(modifier.id, modifierId),
          eq(menu.organizationId, organizationId),
        ),
      );
    if (!found) throw menuNotFoundError('modifierNotFound');
  }

  private async assertSourceRecipeUpdate(
    recipeId: string,
    {
      menuItemId,
      modifierId,
      recipeYieldQuantity,
      recipeYieldUnitCode,
    }: UpdateRecipeDto,
  ): Promise<void> {
    if (
      !menuItemId &&
      !modifierId &&
      recipeYieldQuantity === undefined &&
      recipeYieldUnitCode === undefined
    )
      return;

    const sourced = await this.db
      .select({ unitCode: ingredient.unitCode })
      .from(ingredient)
      .where(eq(ingredient.recipeId, recipeId));
    if (!sourced.length) return;

    if (menuItemId) throw badRequestError('sourceRecipeHasMenuItem');
    if (modifierId) throw badRequestError('sourceRecipeHasModifier');
    if (recipeYieldQuantity === null || recipeYieldUnitCode === null)
      throw badRequestError('sourceRecipeYieldMissing');
    if (
      recipeYieldUnitCode &&
      sourced.some(
        ({ unitCode }) =>
          !COMPATIBLE_UNIT_CODES[unitCode].includes(recipeYieldUnitCode),
      )
    )
      throw badRequestError('sourceRecipeUnitIncompatible');
  }

  private async assertMaterialNotSourced(
    recipeId: string,
    ingredientId: string | undefined,
  ): Promise<void> {
    if (!ingredientId) return;

    const [nested] = await this.db
      .select({ id: ingredient.id })
      .from(ingredient)
      .where(
        and(
          eq(ingredient.id, ingredientId),
          isNotNull(ingredient.recipeId),
          exists(
            this.db
              .select({ id: ingredient.id })
              .from(ingredient)
              .where(eq(ingredient.recipeId, recipeId)),
          ),
        ),
      );
    if (nested) throw badRequestError('sourceRecipeNested');
  }

  private async assertIngredientInRecipeOrganization(
    recipeId: string,
    ingredientId: string | undefined,
  ): Promise<void> {
    if (!ingredientId) return;

    const [found] = await this.db
      .select({ id: ingredient.id })
      .from(ingredient)
      .innerJoin(recipe, eq(recipe.organizationId, ingredient.organizationId))
      .where(and(eq(ingredient.id, ingredientId), eq(recipe.id, recipeId)));
    if (!found) throw notFoundError('ingredientNotFound');
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
      throw conflictError('recipeIngredientExists');
    }
  }

  private async guardDuplicate<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflictError('recipeIngredientExists');
      throw error;
    }
  }

  async createIngredient(
    recipeId: string,
    { sortOrder, ...dto }: CreateRecipeIngredientDto,
  ): Promise<RecipeIngredientResponseDto> {
    await this.assertIngredientInRecipeOrganization(recipeId, dto.ingredientId);
    await this.assertMaterialNotSourced(recipeId, dto.ingredientId);
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
          sortOrder: sortOrder ?? (maxSortOrder ?? -1) + 1,
        })
        .returning(),
    );

    return this.toMaterial(created.id);
  }

  async updateIngredient(
    recipeId: string,
    recipeIngredientId: string,
    dto: UpdateRecipeIngredientDto,
  ): Promise<RecipeIngredientResponseDto> {
    await this.assertIngredientInRecipeOrganization(recipeId, dto.ingredientId);
    await this.assertMaterialNotSourced(recipeId, dto.ingredientId);
    await this.assertIngredientNotUsed(
      recipeId,
      dto.ingredientId,
      recipeIngredientId,
    );

    const [updated] = await this.guardDuplicate(() =>
      this.db
        .update(recipeIngredient)
        .set(dto)
        .where(
          and(
            eq(recipeIngredient.id, recipeIngredientId),
            eq(recipeIngredient.recipeId, recipeId),
          ),
        )
        .returning(),
    );
    if (!updated) throw notFoundError('recipeIngredientNotFound');

    return this.toMaterial(updated.id);
  }

  async removeIngredient(
    recipeId: string,
    recipeIngredientId: string,
  ): Promise<void> {
    const deleted = await this.db
      .delete(recipeIngredient)
      .where(
        and(
          eq(recipeIngredient.id, recipeIngredientId),
          eq(recipeIngredient.recipeId, recipeId),
        ),
      )
      .returning({ id: recipeIngredient.id });
    if (!deleted.length) throw notFoundError('recipeIngredientNotFound');
  }

  async removeIngredients(recipeId: string, ids: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(recipeIngredient)
          .where(
            and(
              eq(recipeIngredient.recipeId, recipeId),
              eq(recipeIngredient.id, id),
            ),
          )
          .returning({ id: recipeIngredient.id });
        if (!deleted.length) throw notFoundError('recipeIngredientNotFound');
      }
    });
  }

  async reorderIngredients(
    recipeId: string,
    ids: string[],
    offset: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(recipeIngredient)
          .set({ sortOrder: offset + i })
          .where(
            and(
              eq(recipeIngredient.id, id),
              eq(recipeIngredient.recipeId, recipeId),
            ),
          );
      }
    });
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
    if (!material) throw notFoundError('recipeIngredientNotFound');

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
      .select({
        material: recipeIngredient,
        ingredient,
        unitPrice: unitPriceSql,
      })
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
    rows: {
      material: RecipeIngredient;
      ingredient: Ingredient;
      unitPrice: number | null;
    }[],
    canReadPurchasing: boolean,
  ): RecipeIngredientResponseDto[] {
    return rows.map(({ material, ingredient: source, unitPrice }) => {
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
