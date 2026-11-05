import { eq, sql, type SQL } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';

import { UNIT_FACTORS } from '../common/constants/units.js';
import type { Ingredient } from '../db/schema/inventory.js';
import {
  ingredient,
  recipe,
  recipeIngredient,
} from '../db/schema/inventory.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

type Package = Pick<
  Ingredient,
  'eligibleQuantity' | 'eligibleQuantityUnitCode' | 'price'
>;

export const baseQuantityOf = ({
  eligibleQuantity,
  eligibleQuantityUnitCode,
}: Package): number | null =>
  eligibleQuantity && eligibleQuantityUnitCode
    ? Number(eligibleQuantity) * UNIT_FACTORS[eligibleQuantityUnitCode]
    : null;

export const pricingOf = (row: Package, unitPrice: number | null) => ({
  packageBaseQuantity: baseQuantityOf(row),
  packageQuantity: row.eligibleQuantity,
  packageUnitCode: row.eligibleQuantityUnitCode,
  unitPrice,
});

const unitFactorSql = (unitCode: PgColumn): SQL =>
  sql`case ${sql.join(
    Object.entries(UNIT_FACTORS).map(
      ([code, factor]) =>
        sql`when ${unitCode} = ${code} then ${factor}::numeric`,
    ),
    sql` `,
  )} end`;

const packageUnitPriceSql = (
  row: Record<
    'eligibleQuantity' | 'eligibleQuantityUnitCode' | 'price',
    PgColumn
  >,
): SQL =>
  sql`(${row.price} / nullif(${row.eligibleQuantity} * ${unitFactorSql(row.eligibleQuantityUnitCode)}, 0))`;

export const packageBaseQuantitySql = sql`(${ingredient.eligibleQuantity} * ${unitFactorSql(ingredient.eligibleQuantityUnitCode)})`;

const material = alias(ingredient, 'source_material');
const materialLine = alias(recipeIngredient, 'source_material_line');
const sourceRecipe = alias(recipe, 'source_recipe');
const materialUnitPrice = packageUnitPriceSql(material);

const recipeUnitPriceSql = sql`(
  (select case when count(*) = count(${materialUnitPrice})
      then sum(${materialLine.requiredQuantity} * ${materialUnitPrice}) end
    from ${recipeIngredient} as ${materialLine}
    inner join ${ingredient} as ${material} on ${material.id} = ${materialLine.ingredientId}
    where ${materialLine.recipeId} = ${ingredient.recipeId})
  / nullif((select ${sourceRecipe.recipeYieldQuantity} * ${unitFactorSql(sourceRecipe.recipeYieldUnitCode)}
    from ${recipe} as ${sourceRecipe}
    where ${sourceRecipe.id} = ${ingredient.recipeId}), 0)
)`;

export const unitPriceSql = sql<
  number | null
>`(case when ${ingredient.recipeId} is null
  then ${packageUnitPriceSql(ingredient)}
  else ${recipeUnitPriceSql} end)`.mapWith(Number);

export const unitPriceOf = async (
  db: Pick<DrizzleDB, 'select'>,
  ingredientId: string,
): Promise<number | null> => {
  const [row] = await db
    .select({ unitPrice: unitPriceSql })
    .from(ingredient)
    .where(eq(ingredient.id, ingredientId));

  return row?.unitPrice ?? null;
};
