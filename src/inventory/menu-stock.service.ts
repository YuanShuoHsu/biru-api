import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, asc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';

import {
  ingredient,
  recipe,
  recipeIngredient,
} from '../db/schema/inventory.js';
import {
  menu,
  menuItem,
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
) =>
  availability === undefined
    ? {}
    : {
        autoSoldOut: sql<boolean>`${offer.autoSoldOut} and ${offer.availability} is not distinct from ${availability}::item_availability`,
      };

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
      if (!offers.length) return false;

      const materials = await tx
        .select({
          inventoryLevel: ingredient.inventoryLevel,
          menuItemId: recipe.menuItemId,
          recipeYield: recipe.recipeYield,
          requiredQuantity: recipeIngredient.requiredQuantity,
        })
        .from(recipe)
        .innerJoin(recipeIngredient, eq(recipeIngredient.recipeId, recipe.id))
        .innerJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
        .where(
          and(
            eq(recipe.organizationId, organizationId),
            isNotNull(recipe.menuItemId),
            gt(recipeIngredient.requiredQuantity, '0'),
          ),
        );

      const shortOfIngredients = new Set(
        materials
          .filter(
            ({ inventoryLevel, recipeYield, requiredQuantity }) =>
              Number(inventoryLevel) <
              Number(requiredQuantity) / recipeYield - QUANTITY_TOLERANCE,
          )
          .map(({ menuItemId }) => menuItemId),
      );

      const isShort = ({
        inventoryLevel,
        menuItemId,
      }: (typeof offers)[number]) =>
        (typeof inventoryLevel?.value === 'number' &&
          inventoryLevel.value < 1) ||
        shortOfIngredients.has(menuItemId);

      const toSoldOut = offers
        .filter(
          (row) =>
            (row.availability ?? 'InStock') === 'InStock' && isShort(row),
        )
        .map(({ id }) => id);
      const toInStock = offers
        .filter(
          (row) =>
            row.availability === 'SoldOut' && row.autoSoldOut && !isShort(row),
        )
        .map(({ id }) => id);

      const updatedAt = new Date();
      if (toSoldOut.length)
        await tx
          .update(offer)
          .set({ autoSoldOut: true, availability: 'SoldOut', updatedAt })
          .where(inArray(offer.id, toSoldOut));
      if (toInStock.length)
        await tx
          .update(offer)
          .set({ autoSoldOut: false, availability: 'InStock', updatedAt })
          .where(inArray(offer.id, toInStock));

      return toSoldOut.length > 0 || toInStock.length > 0;
    });
  }
}
