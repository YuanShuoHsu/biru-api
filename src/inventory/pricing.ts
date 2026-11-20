import { eq, sql, type SQL } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';

import { BUSINESS_TAX_RATE } from '../common/constants/business-tax.js';
import { UNIT_FACTORS } from '../common/constants/units.js';
import type { Ingredient } from '../db/schema/inventory.js';
import {
  ingredient,
  recipe,
  recipeIngredient,
  supplier,
} from '../db/schema/inventory.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

type Package = Pick<
  Ingredient,
  'eligibleQuantity' | 'eligibleQuantityUnitCode' | 'price'
>;

export const baseQuantityOf = ({
  eligibleQuantity,
  eligibleQuantityUnitCode,
}: Omit<Package, 'price'>): number | null =>
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

const recipeUnitPriceOf = (materialPrice: SQL) => sql`(
  (select case when count(*) = count(${materialPrice})
      then sum(${materialLine.requiredQuantity} * ${materialPrice}) end
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
  else ${recipeUnitPriceOf(materialUnitPrice)} end)`.mapWith(Number);

const invoiceSupplier = alias(supplier, 'invoice_supplier');

const inputTaxDivisorSql = (supplierId: PgColumn): SQL =>
  sql`coalesce((select case when ${invoiceSupplier.uniformInvoice} then ${1 + BUSINESS_TAX_RATE}::numeric else 1 end
    from ${supplier} as ${invoiceSupplier}
    where ${invoiceSupplier.id} = ${supplierId}), 1)`;

export const netUnitPriceSql = sql<
  number | null
>`(case when ${ingredient.recipeId} is null
  then ${packageUnitPriceSql(ingredient)} / ${inputTaxDivisorSql(ingredient.supplierId)}
  else ${recipeUnitPriceOf(sql`(${materialUnitPrice} / ${inputTaxDivisorSql(material.supplierId)})`)} end)`.mapWith(
  Number,
);

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
