import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, asc, eq, gt, inArray, isNotNull, or, sql } from 'drizzle-orm';

import {
  ingredient,
  recipe,
  recipeIngredient,
} from '../db/schema/inventory.js';
import {
  menu,
  menuItem,
  modifier,
  modifierGroup,
  offer,
  type ItemAvailability,
} from '../db/schema/menus.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import { MENU_UPDATED_EVENT } from '../events/menu-updated.event.js';

// 庫存只存到小數第三位，每份用量四捨五入後會差半個最小單位
export const QUANTITY_TOLERANCE = 0.0005;

// 店員送出與目前相同的供應狀態（例如只改價格）時保留自動售完，補貨後仍會自動恢復
export const keepAutoSoldOut = (
  availability: ItemAvailability | null | undefined,
  table: typeof offer | typeof modifier,
) =>
  availability === undefined
    ? {}
    : {
        autoSoldOut: sql<boolean>`${table.autoSoldOut} and ${table.availability} is not distinct from ${availability}::item_availability`,
      };

const soldOutChanges = <
  T extends {
    autoSoldOut: boolean;
    availability: ItemAvailability | null;
    id: string;
  },
>(
  rows: T[],
  isShort: (row: T) => boolean,
) => ({
  toInStock: rows
    .filter(
      (row) =>
        row.availability === 'SoldOut' && row.autoSoldOut && !isShort(row),
    )
    .map(({ id }) => id),
  toSoldOut: rows
    .filter(
      (row) => (row.availability ?? 'InStock') === 'InStock' && isShort(row),
    )
    .map(({ id }) => id),
});

@Injectable()
export class MenuStockService {
  private readonly logger = new Logger(MenuStockService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async refresh(organizationId: string, menuChanged = false): Promise<void> {
    let changed = menuChanged;
    try {
      changed = (await this.sync(organizationId)) || changed;
    } catch (error) {
      this.logger.error(
        `Failed to sync sold-out states of organization ${organizationId}`,
        error,
      );
    }

    if (changed) this.eventEmitter.emit(MENU_UPDATED_EVENT, { organizationId });
  }

  async sync(organizationId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const offers = await tx
        .select({
          autoSoldOut: offer.autoSoldOut,
          availability: offer.availability,
          id: offer.id,
          inventoryLevel: offer.inventoryLevel,
          menuItemId: offer.menuItemId,
        })
        .from(offer)
        .innerJoin(menuItem, eq(menuItem.id, offer.menuItemId))
        .innerJoin(menu, eq(menu.id, menuItem.menuId))
        .where(eq(menu.organizationId, organizationId))
        .orderBy(asc(offer.id))
        .for('update', { of: offer });
      const modifiers = await tx
        .select({
          autoSoldOut: modifier.autoSoldOut,
          availability: modifier.availability,
          id: modifier.id,
        })
        .from(modifier)
        .innerJoin(
          modifierGroup,
          eq(modifierGroup.id, modifier.modifierGroupId),
        )
        .innerJoin(menu, eq(menu.id, modifierGroup.menuId))
        .where(
          and(
            eq(menu.organizationId, organizationId),
            or(
              eq(modifier.autoSoldOut, true),
              inArray(
                modifier.id,
                tx
                  .select({ id: recipe.modifierId })
                  .from(recipe)
                  .where(eq(recipe.organizationId, organizationId)),
              ),
            ),
          ),
        )
        .orderBy(asc(modifier.id))
        .for('update', { of: modifier });
      if (!offers.length && !modifiers.length) return false;

      const materials = await tx
        .select({
          inventoryLevel: ingredient.inventoryLevel,
          menuItemId: recipe.menuItemId,
          modifierId: recipe.modifierId,
          recipeYield: recipe.recipeYield,
          requiredQuantity: recipeIngredient.requiredQuantity,
        })
        .from(recipe)
        .innerJoin(recipeIngredient, eq(recipeIngredient.recipeId, recipe.id))
        .innerJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
        .where(
          and(
            eq(recipe.organizationId, organizationId),
            or(isNotNull(recipe.menuItemId), isNotNull(recipe.modifierId)),
            gt(recipeIngredient.requiredQuantity, '0'),
            eq(ingredient.unlimitedStock, false),
          ),
        );

      const shortRecipes = materials.filter(
        ({ inventoryLevel, recipeYield, requiredQuantity }) =>
          Number(inventoryLevel) <
          Number(requiredQuantity) / recipeYield - QUANTITY_TOLERANCE,
      );
      const shortMenuItems = new Set(
        shortRecipes.map(({ menuItemId }) => menuItemId),
      );
      const shortModifiers = new Set(
        shortRecipes.map(({ modifierId }) => modifierId),
      );

      const offerChanges = soldOutChanges(
        offers,
        ({ inventoryLevel, menuItemId }) =>
          (typeof inventoryLevel?.value === 'number' &&
            inventoryLevel.value < 1) ||
          shortMenuItems.has(menuItemId),
      );
      const modifierChanges = soldOutChanges(modifiers, ({ id }) =>
        shortModifiers.has(id),
      );

      const updatedAt = new Date();
      for (const [table, { toInStock, toSoldOut }] of [
        [offer, offerChanges],
        [modifier, modifierChanges],
      ] as const) {
        if (toSoldOut.length)
          await tx
            .update(table)
            .set({ autoSoldOut: true, availability: 'SoldOut', updatedAt })
            .where(inArray(table.id, toSoldOut));
        if (toInStock.length)
          await tx
            .update(table)
            .set({ autoSoldOut: false, availability: 'InStock', updatedAt })
            .where(inArray(table.id, toInStock));
      }

      return [offerChanges, modifierChanges].some(
        ({ toInStock, toSoldOut }) =>
          toInStock.length > 0 || toSoldOut.length > 0,
      );
    });
  }
}
