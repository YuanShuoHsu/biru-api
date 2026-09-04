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

import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import { getOrganizationIdBySlug } from 'src/common/utils/organizations';
import type { LocalizedText } from 'src/db/schema/enums';
import {
  ingredient,
  ingredientOffer,
  recipe,
  recipeIngredient,
  type Recipe,
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
  RECIPE_DATE_FILTER_FIELDS,
  RECIPE_NUMBER_FILTER_FIELDS,
  RECIPE_STRING_FILTER_FIELDS,
  RecipePaginationQueryDto,
} from './dto/recipe-pagination-query.dto';
import {
  RecipeIngredientResponseDto,
  RecipeResponseDto,
} from './dto/recipe-response.dto';
import { unitPriceOf } from './ingredients.service';
import { bindMenuItemByRecipeName } from './recipe-menu-item-binding';

@Injectable()
export class RecipesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll(
    organizationSlug: string,
    query: RecipePaginationQueryDto = {},
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

    return { data: await this.toResponse(data), total };
  }

  async findOne(recipeId: string): Promise<RecipeResponseDto> {
    const found = await this.db.query.recipe.findFirst({
      where: eq(recipe.id, recipeId),
    });
    if (!found) throw new NotFoundException('Recipe not found');

    const materials = await this.materialsOf([recipeId]);
    const [response] = await this.toResponse([found], materials);

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

    const [response] = await this.toResponse([created]);

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

    const [response] = await this.toResponse([updated]);

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
  ): Promise<RecipeIngredientResponseDto[]> {
    const materials = await this.materialsOf([recipeId]);

    return materials.get(recipeId) ?? [];
  }

  async createIngredient(
    recipeId: string,
    dto: CreateRecipeIngredientDto,
  ): Promise<RecipeIngredientResponseDto> {
    const [{ maxSortOrder }] = await this.db
      .select({ maxSortOrder: max(recipeIngredient.sortOrder) })
      .from(recipeIngredient)
      .where(eq(recipeIngredient.recipeId, recipeId));

    const [created] = await this.db
      .insert(recipeIngredient)
      .values({
        ...dto,
        id: randomUUID(),
        recipeId,
        sortOrder: dto.sortOrder ?? (maxSortOrder ?? -1) + 1,
      })
      .returning();

    return this.toMaterial(created.id);
  }

  async updateIngredient(
    recipeIngredientId: string,
    dto: UpdateRecipeIngredientDto,
  ): Promise<RecipeIngredientResponseDto> {
    const [updated] = await this.db
      .update(recipeIngredient)
      .set(dto)
      .where(eq(recipeIngredient.id, recipeIngredientId))
      .returning();
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

    const materials = await this.materialsOf([row.recipeId]);
    const material = materials
      .get(row.recipeId)
      ?.find(({ id }) => id === recipeIngredientId);
    if (!material) throw new NotFoundException('Recipe ingredient not found');

    return material;
  }

  private async toResponse(
    recipes: Recipe[],
    loaded?: Map<string, RecipeIngredientResponseDto[]>,
  ): Promise<RecipeResponseDto[]> {
    const materials =
      loaded ?? (await this.materialsOf(recipes.map(({ id }) => id)));
    const prices = await this.pricesOf(
      recipes.flatMap(({ menuItemId }) => menuItemId ?? []),
    );
    const menuItemNames = await this.menuItemNamesOf(
      recipes.flatMap(({ menuItemId }) => menuItemId ?? []),
    );

    return recipes.map((row) => ({
      ...row,
      cost: (materials.get(row.id) ?? []).reduce(
        (sum, { cost }) => sum + (cost ?? 0),
        0,
      ),
      menuItemName: row.menuItemId
        ? (menuItemNames.get(row.menuItemId) ?? null)
        : null,
      price: row.menuItemId ? (prices.get(row.menuItemId) ?? null) : null,
    }));
  }

  private async materialsOf(
    recipeIds: string[],
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

    const offers = rows.length
      ? await this.db
          .select()
          .from(ingredientOffer)
          .where(
            inArray(
              ingredientOffer.ingredientId,
              rows.map(({ ingredient: { id } }) => id),
            ),
          )
          .orderBy(
            asc(ingredientOffer.sortOrder),
            asc(ingredientOffer.createdAt),
          )
      : [];

    const unitPrices = new Map<string, number>();
    for (const row of offers) {
      if (!unitPrices.has(row.ingredientId))
        unitPrices.set(row.ingredientId, unitPriceOf(row));
    }

    const materials = new Map<string, RecipeIngredientResponseDto[]>();
    for (const { material, ingredient: source } of rows) {
      const unitPrice = unitPrices.get(source.id) ?? null;
      const list = materials.get(material.recipeId) ?? [];

      list.push({
        ...material,
        cost:
          unitPrice === null
            ? null
            : Number(material.requiredQuantity) * unitPrice,
        ingredientName: source.name,
        unitCode: source.unitCode,
        unitPrice,
      });
      materials.set(material.recipeId, list);
    }

    return materials;
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
