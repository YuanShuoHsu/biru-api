import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';

import type { PgColumn } from 'drizzle-orm/pg-core';

import type { LocalizedText } from 'src/db/schema/enums';
import { recipe } from 'src/db/schema/inventory';
import { menu, menuItem } from 'src/db/schema/menus';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

type Tx = Pick<DrizzleDB, 'select' | 'transaction' | 'update'>;

export type BoundRecipe = { id: string; name: LocalizedText };

const sameName = (column: PgColumn, name: LocalizedText): SQL =>
  sql`exists (
    select 1
    from jsonb_each_text(${column}) as entry
    where btrim(entry.value) <> ''
      and lower(btrim(entry.value))
        = lower(btrim(${JSON.stringify(name)}::jsonb ->> entry.key))
  )`;

const claim = async (
  tx: Tx,
  recipeId: string,
  menuItemId: string,
): Promise<boolean> => {
  try {
    await tx.transaction(async (savepoint) => {
      await savepoint
        .update(recipe)
        .set({ menuItemId, updatedAt: new Date() })
        .where(eq(recipe.id, recipeId));
    });

    return true;
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === '23505')
      return false;
    throw error;
  }
};

export const bindRecipeByMenuItemName = async (
  tx: Tx,
  params: {
    menuItemId: string;
    name: LocalizedText;
    organizationId: string;
  },
): Promise<BoundRecipe | null> => {
  const [candidates, bound] = await Promise.all([
    tx
      .select({ id: recipe.id, name: recipe.name })
      .from(recipe)
      .where(
        and(
          eq(recipe.organizationId, params.organizationId),
          isNull(recipe.menuItemId),
          sameName(recipe.name, params.name),
        ),
      )
      .limit(2),
    tx
      .select({ id: recipe.id })
      .from(recipe)
      .where(eq(recipe.menuItemId, params.menuItemId))
      .limit(1),
  ]);
  if (bound.length || candidates.length !== 1) return null;

  return (await claim(tx, candidates[0].id, params.menuItemId))
    ? candidates[0]
    : null;
};

export const bindMenuItemByRecipeName = async (
  tx: Tx,
  params: {
    name: LocalizedText;
    organizationId: string;
    recipeId: string;
  },
): Promise<string | null> => {
  const candidates = await tx
    .select({ id: menuItem.id })
    .from(menuItem)
    .innerJoin(menu, eq(menu.id, menuItem.menuId))
    .where(
      and(
        eq(menu.organizationId, params.organizationId),
        sameName(menuItem.name, params.name),
        sql`not exists (select 1 from ${recipe} where ${recipe.menuItemId} = ${menuItem.id})`,
      ),
    )
    .limit(2);
  if (candidates.length !== 1) return null;

  return (await claim(tx, params.recipeId, candidates[0].id))
    ? candidates[0].id
    : null;
};
