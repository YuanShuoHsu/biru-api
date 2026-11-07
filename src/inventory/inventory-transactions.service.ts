import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';

import { UNIT_FACTORS } from '../common/constants/units.js';
import { accessForbiddenError } from '../common/utils/access-forbidden-error.js';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  escapeLike,
  localTimeText,
} from '../common/utils/data-grid-filters.js';
import {
  ingredient,
  inventoryTransaction,
  recipe,
  recipeIngredient,
  type InventoryTransaction,
} from '../db/schema/inventory.js';
import { offer } from '../db/schema/menus.js';
import { order, orderItem } from '../db/schema/orders.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import {
  LOW_STOCK_REACHED_EVENT,
  type LowStockReachedEvent,
} from '../events/low-stock-reached.event.js';

import { CreateIngredientBatchDto } from './dto/create-ingredient-batch.dto.js';
import { CreateInventoryTransactionDto } from './dto/create-inventory-transaction.dto.js';
import {
  INVENTORY_TRANSACTION_DATE_FILTER_FIELDS,
  INVENTORY_TRANSACTION_ENUM_FILTER_FIELDS,
  INVENTORY_TRANSACTION_NUMBER_FILTER_FIELDS,
  INVENTORY_TRANSACTION_STRING_FILTER_FIELDS,
  InventoryTransactionPaginationQueryDto,
} from './dto/inventory-transaction-pagination-query.dto.js';
import {
  InventoryTransactionResponseDto,
  type InventoryTransactionReason,
} from './dto/inventory-transaction-response.dto.js';
import { badRequestError, notFoundError } from './inventory-errors.js';
import { QUANTITY_TOLERANCE } from './menu-stock.service.js';
import { unitPriceSql } from './pricing.js';

type Tx = Pick<DrizzleDB, 'insert' | 'select' | 'update'>;

export type StockSource = { menuItemId: string } | { modifierId: string };

export class InsufficientStockError extends Error {
  constructor(readonly source: StockSource) {
    super(`Insufficient stock for ${JSON.stringify(source)}`);
  }
}

@Injectable()
export class InventoryTransactionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(
    ingredientId: string,
    query: InventoryTransactionPaginationQueryDto = {},
    canReadPurchasing = true,
  ): Promise<{ data: InventoryTransactionResponseDto[]; total: number }> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      sortBy,
      sortDirection = 'desc',
    } = query;

    // 成本欄位剝掉後仍能被排序、篩選與快速搜尋反推，三條路要一起封
    if (!canReadPurchasing && [sortBy, filterField].includes('unitCost'))
      throw accessForbiddenError();

    const reason = sql<InventoryTransactionReason>`case
      when ${inventoryTransaction.productionBatchId} is not null then 'batch'
      when ${inventoryTransaction.orderId} is null then 'count'
      when ${inventoryTransaction.quantity} <= 0 then 'consume'
      else 'restore'
    end`;

    const ledger = this.db
      .select({
        id: inventoryTransaction.id,
        balance: sql<string>`sum(${inventoryTransaction.quantity}) over (
          order by ${inventoryTransaction.createdAt}, ${inventoryTransaction.id}
        )`.as('balance'),
      })
      .from(inventoryTransaction)
      .where(eq(inventoryTransaction.ingredientId, ingredientId))
      .as('ledger');

    const fieldMap: Record<string, Column | SQL> = {
      quantity: inventoryTransaction.quantity,
      unitCost: inventoryTransaction.unitCost,
      note: inventoryTransaction.note,
      reason,
      createdAt: inventoryTransaction.createdAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const tiebreakers = [
      dir(inventoryTransaction.createdAt),
      dir(inventoryTransaction.id),
    ];
    const orderBy = sortBy
      ? [dir(fieldMap[sortBy]), ...tiebreakers]
      : tiebreakers;

    const where = and(
      eq(inventoryTransaction.ingredientId, ingredientId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            INVENTORY_TRANSACTION_STRING_FILTER_FIELDS,
            INVENTORY_TRANSACTION_DATE_FILTER_FIELDS,
            INVENTORY_TRANSACTION_ENUM_FILTER_FIELDS,
            INVENTORY_TRANSACTION_NUMBER_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: INVENTORY_TRANSACTION_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(
            sql`${inventoryTransaction.quantity}::text`,
            `%${escapeLike(value)}%`,
          ),
          ...(canReadPurchasing
            ? [
                ilike(
                  sql`${inventoryTransaction.unitCost}::text`,
                  `%${escapeLike(value)}%`,
                ),
              ]
            : []),
          ilike(inventoryTransaction.note, `%${escapeLike(value)}%`),
          ilike(order.orderNumber, `%${escapeLike(value)}%`),
          ilike(
            localTimeText(inventoryTransaction.createdAt),
            `%${escapeLike(value)}%`,
          ),
        ],
      }),
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          inventoryTransaction,
          balance: ledger.balance,
          orderNumber: order.orderNumber,
          reason,
        })
        .from(inventoryTransaction)
        .innerJoin(ledger, eq(ledger.id, inventoryTransaction.id))
        .leftJoin(order, eq(order.id, inventoryTransaction.orderId))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(inventoryTransaction)
        .leftJoin(order, eq(order.id, inventoryTransaction.orderId))
        .where(where),
    ]);

    return {
      data: rows.map(
        ({
          inventoryTransaction: { unitCost, ...row },
          balance,
          orderNumber,
          reason,
        }) => ({
          ...row,
          ...(canReadPurchasing && { unitCost }),
          balance,
          orderNumber,
          reason,
        }),
      ),
      total,
    };
  }

  async create(
    ingredientId: string,
    dto: CreateInventoryTransactionDto,
    {
      canReadPurchasing = true,
      tx,
    }: { canReadPurchasing?: boolean; tx?: Tx } = {},
  ): Promise<InventoryTransactionResponseDto> {
    const created = tx
      ? await this.write(ingredientId, dto, tx)
      : await this.db.transaction((opened) =>
          this.write(ingredientId, dto, opened),
        );

    const { unitCost, ...rest } = created;

    return { ...rest, ...(canReadPurchasing && { unitCost }) };
  }

  private async write(
    ingredientId: string,
    dto: CreateInventoryTransactionDto,
    tx: Tx,
  ): Promise<InventoryTransactionResponseDto> {
    const [found] = await tx
      .select({
        organizationId: ingredient.organizationId,
        inventoryLevel: ingredient.inventoryLevel,
        unitPrice: unitPriceSql,
      })
      .from(ingredient)
      .where(eq(ingredient.id, ingredientId))
      .for('update');
    if (!found) throw notFoundError('ingredientNotFound');

    const inventoryLevel = Number(dto.inventoryLevel);
    const quantity = inventoryLevel - Number(found.inventoryLevel);
    const unitPrice = found.unitPrice?.toString() ?? null;

    const [created] = await tx
      .insert(inventoryTransaction)
      .values({
        id: randomUUID(),
        ingredientId,
        note: dto.note,
        organizationId: found.organizationId,
        quantity: String(quantity),
        // 數量變少時沒有買價可記；進價一律由食材規格推算，不採信呼叫端傳來的值
        unitCost: quantity > 0 ? unitPrice : null,
      })
      .returning();

    const [{ balance }] = await tx
      .update(ingredient)
      .set({ inventoryLevel: String(inventoryLevel) })
      .where(eq(ingredient.id, ingredientId))
      .returning({ balance: ingredient.inventoryLevel });

    return { ...created, balance, orderNumber: null, reason: 'count' };
  }

  async produceBatch(
    organizationId: string,
    ingredientId: string,
    { note, quantity }: CreateIngredientBatchDto,
    canReadPurchasing = true,
  ): Promise<InventoryTransactionResponseDto> {
    const { batch, balance, lowStock } = await this.db.transaction(
      async (tx) => {
        const [target] = await tx
          .select({
            recipeId: ingredient.recipeId,
            recipeYieldQuantity: recipe.recipeYieldQuantity,
            recipeYieldUnitCode: recipe.recipeYieldUnitCode,
            unitPrice: unitPriceSql,
          })
          .from(ingredient)
          .leftJoin(recipe, eq(recipe.id, ingredient.recipeId))
          .where(
            and(
              eq(ingredient.id, ingredientId),
              eq(ingredient.organizationId, organizationId),
            ),
          );
        if (!target) throw notFoundError('ingredientNotFound');
        if (!target.recipeId) throw badRequestError('sourceRecipeRequired');

        const { recipeYieldQuantity, recipeYieldUnitCode } = target;
        const yieldQuantity =
          recipeYieldQuantity && recipeYieldUnitCode
            ? Number(recipeYieldQuantity) * UNIT_FACTORS[recipeYieldUnitCode]
            : 0;
        if (!yieldQuantity) throw badRequestError('sourceRecipeYieldMissing');

        const produced = Number(quantity);
        const materials = await tx
          .select({
            ingredientId: recipeIngredient.ingredientId,
            requiredQuantity: recipeIngredient.requiredQuantity,
          })
          .from(recipeIngredient)
          .innerJoin(
            ingredient,
            eq(ingredient.id, recipeIngredient.ingredientId),
          )
          .where(
            and(
              eq(recipeIngredient.recipeId, target.recipeId),
              eq(ingredient.unlimitedStock, false),
            ),
          )
          .orderBy(asc(recipeIngredient.sortOrder), asc(recipeIngredient.id));
        const used = materials.map(({ ingredientId, requiredQuantity }) => ({
          ingredientId,
          quantity: (Number(requiredQuantity) * produced) / yieldQuantity,
        }));

        const locked = await tx
          .select({
            id: ingredient.id,
            inventoryLevel: ingredient.inventoryLevel,
            name: ingredient.name,
          })
          .from(ingredient)
          .where(
            inArray(ingredient.id, [
              ingredientId,
              ...used.map(({ ingredientId }) => ingredientId),
            ]),
          )
          .orderBy(asc(ingredient.id))
          .for('update');

        const shortfalls = used.flatMap(({ ingredientId, quantity }) => {
          const material = locked.find(({ id }) => id === ingredientId);
          const shortfall = quantity - Number(material?.inventoryLevel);
          return material && shortfall > QUANTITY_TOLERANCE
            ? [
                {
                  id: material.id,
                  name: material.name,
                  shortfall: shortfall.toFixed(3),
                },
              ]
            : [];
        });
        if (shortfalls.length)
          throw badRequestError('insufficientStock', {
            ingredients: shortfalls,
          });

        const { created, lowStock } = await this.record(
          [
            ...used.map(({ ingredientId, quantity }) => ({
              ingredientId,
              quantity: -quantity,
            })),
            {
              ingredientId,
              quantity: produced,
              unitCost: target.unitPrice?.toString() ?? null,
            },
          ],
          { productionBatchId: randomUUID(), note, organizationId },
          tx,
        );

        const [{ balance }] = await tx
          .select({ balance: ingredient.inventoryLevel })
          .from(ingredient)
          .where(eq(ingredient.id, ingredientId));

        return {
          batch: created.find((row) => row.ingredientId === ingredientId)!,
          balance,
          lowStock,
        };
      },
    );

    if (lowStock.length)
      this.eventEmitter.emit(LOW_STOCK_REACHED_EVENT, {
        organizationId,
        ingredients: lowStock,
      } satisfies LowStockReachedEvent);

    const { unitCost, ...rest } = batch;

    return {
      ...rest,
      ...(canReadPurchasing && { unitCost }),
      balance,
      orderNumber: null,
      reason: 'batch',
    };
  }

  async consume(
    orderId: string,
    tx: Tx,
    { enforceStock = false }: { enforceStock?: boolean } = {},
  ): Promise<{
    lowStock: LowStockReachedEvent['ingredients'];
    offerStockChanged: boolean;
  }> {
    const [placed] = await tx
      .select({ sellerId: order.sellerId })
      .from(order)
      .where(eq(order.id, orderId));
    if (!placed?.sellerId) return { lowStock: [], offerStockChanged: false };

    const items = await tx
      .select({
        addOns: orderItem.addOns,
        menuItemId: orderItem.menuItemId,
        modifiers: orderItem.modifiers,
        orderQuantity: orderItem.orderQuantity,
      })
      .from(orderItem)
      .where(eq(orderItem.orderId, orderId));

    const servingsByMenuItemId = new Map<string, number>();
    const servingsByModifierId = new Map<string, number>();
    for (const { addOns, menuItemId, modifiers, orderQuantity } of items) {
      for (const id of [
        menuItemId,
        ...(addOns ?? []).map((addOn) => addOn.menuItemId),
      ])
        servingsByMenuItemId.set(
          id,
          (servingsByMenuItemId.get(id) ?? 0) + orderQuantity,
        );
      for (const { modifierId } of [
        ...(modifiers ?? []),
        ...(addOns ?? []).flatMap((addOn) => addOn.modifiers ?? []),
      ])
        servingsByModifierId.set(
          modifierId,
          (servingsByModifierId.get(modifierId) ?? 0) + orderQuantity,
        );
    }
    if (!servingsByMenuItemId.size)
      return { lowStock: [], offerStockChanged: false };

    const offerStockChanged = await this.holdOfferStock(
      orderId,
      servingsByMenuItemId,
      enforceStock,
      tx,
    );

    const recipes = await tx
      .select({
        id: recipe.id,
        menuItemId: recipe.menuItemId,
        modifierId: recipe.modifierId,
        recipeYield: recipe.recipeYield,
      })
      .from(recipe)
      .where(
        or(
          inArray(recipe.menuItemId, [...servingsByMenuItemId.keys()]),
          inArray(recipe.modifierId, [...servingsByModifierId.keys()]),
        ),
      )
      .orderBy(asc(recipe.menuItemId), asc(recipe.modifierId));
    if (!recipes.length) return { lowStock: [], offerStockChanged };

    const materials = await tx
      .select({
        ingredientId: recipeIngredient.ingredientId,
        recipeId: recipeIngredient.recipeId,
        requiredQuantity: recipeIngredient.requiredQuantity,
      })
      .from(recipeIngredient)
      .innerJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
      .where(
        and(
          inArray(
            recipeIngredient.recipeId,
            recipes.map(({ id }) => id),
          ),
          eq(ingredient.unlimitedStock, false),
        ),
      );

    const quantities = new Map<string, number>();
    const sourceByIngredientId = new Map<string, StockSource>();
    for (const { id, menuItemId, modifierId, recipeYield } of recipes) {
      const source = menuItemId
        ? { menuItemId }
        : modifierId
          ? { modifierId }
          : null;
      const servings =
        (menuItemId
          ? servingsByMenuItemId.get(menuItemId)
          : modifierId && servingsByModifierId.get(modifierId)) || 0;

      for (const material of materials.filter(
        ({ recipeId }) => recipeId === id,
      )) {
        const used =
          (Number(material.requiredQuantity) / recipeYield) * servings;
        quantities.set(
          material.ingredientId,
          (quantities.get(material.ingredientId) ?? 0) + used,
        );
        if (source && !sourceByIngredientId.has(material.ingredientId))
          sourceByIngredientId.set(material.ingredientId, source);
      }
    }

    const { lowStock } = await this.record(
      [...quantities].map(([ingredientId, used]) => ({
        ingredientId,
        quantity: -used,
      })),
      {
        ...(enforceStock && { sourceByIngredientId }),
        orderId,
        organizationId: placed.sellerId,
      },
      tx,
    );

    return { lowStock, offerStockChanged };
  }

  async restoreAll(orderId: string, tx: Tx): Promise<boolean> {
    const offerStockChanged = await this.releaseOfferStock(orderId, tx);

    const rows = await tx
      .select({
        ingredientId: inventoryTransaction.ingredientId,
        organizationId: inventoryTransaction.organizationId,
        quantity: inventoryTransaction.quantity,
      })
      .from(inventoryTransaction)
      .where(eq(inventoryTransaction.orderId, orderId));

    const net = new Map<string, number>();
    for (const { ingredientId, quantity } of rows) {
      net.set(ingredientId, (net.get(ingredientId) ?? 0) + Number(quantity));
    }

    const entries = [...net]
      .filter(([, quantity]) => quantity < 0)
      .map(([ingredientId, quantity]) => ({
        ingredientId,
        quantity: -quantity,
      }));
    if (!entries.length) return offerStockChanged;

    await this.record(
      entries,
      { orderId, organizationId: rows[0].organizationId },
      tx,
    );

    return offerStockChanged;
  }

  async lockHeldOfferStock(orderIds: string[], tx: Tx): Promise<void> {
    const orders = await tx
      .select({ heldOfferStock: order.heldOfferStock })
      .from(order)
      .where(inArray(order.id, orderIds));
    const offerIds = [
      ...new Set(
        orders.flatMap(({ heldOfferStock }) =>
          Object.keys(heldOfferStock ?? {}),
        ),
      ),
    ];
    if (!offerIds.length) return;

    await tx
      .select({ id: offer.id })
      .from(offer)
      .where(inArray(offer.id, offerIds))
      .orderBy(asc(offer.id))
      .for('update');
  }

  private async holdOfferStock(
    orderId: string,
    servingsByMenuItemId: Map<string, number>,
    enforceStock: boolean,
    tx: Tx,
  ): Promise<boolean> {
    const offers = await tx
      .select({ id: offer.id, menuItemId: offer.menuItemId })
      .from(offer)
      .where(inArray(offer.menuItemId, [...servingsByMenuItemId.keys()]))
      .orderBy(asc(offer.createdAt));

    const offerIdByMenuItemId = new Map<string, string>();
    for (const { id, menuItemId } of offers)
      if (menuItemId && !offerIdByMenuItemId.has(menuItemId))
        offerIdByMenuItemId.set(menuItemId, id);
    if (!offerIdByMenuItemId.size) return false;

    const locked = await tx
      .select({ id: offer.id, inventoryLevel: offer.inventoryLevel })
      .from(offer)
      .where(inArray(offer.id, [...offerIdByMenuItemId.values()]))
      .orderBy(asc(offer.id))
      .for('update');

    const held: Record<string, number> = {};
    for (const [menuItemId, offerId] of offerIdByMenuItemId) {
      const inventoryLevel = locked.find(
        ({ id }) => id === offerId,
      )?.inventoryLevel;
      const remaining = inventoryLevel?.value;
      if (typeof remaining !== 'number') continue;

      const servings = servingsByMenuItemId.get(menuItemId) ?? 0;
      if (enforceStock && remaining < servings)
        throw new InsufficientStockError({ menuItemId });

      const taken = Math.min(remaining, servings);
      if (taken <= 0) continue;

      await tx
        .update(offer)
        .set({
          inventoryLevel: { ...inventoryLevel, value: remaining - taken },
          updatedAt: new Date(),
        })
        .where(eq(offer.id, offerId));
      held[offerId] = taken;
    }
    if (!Object.keys(held).length) return false;

    await tx
      .update(order)
      .set({ heldOfferStock: held })
      .where(eq(order.id, orderId));

    return true;
  }

  private async releaseOfferStock(orderId: string, tx: Tx): Promise<boolean> {
    const [found] = await tx
      .select({ heldOfferStock: order.heldOfferStock })
      .from(order)
      .where(eq(order.id, orderId))
      .for('update');
    const held = Object.entries(found?.heldOfferStock ?? {});
    if (!held.length) return false;

    const locked = await tx
      .select({ id: offer.id, inventoryLevel: offer.inventoryLevel })
      .from(offer)
      .where(
        inArray(
          offer.id,
          held.map(([offerId]) => offerId),
        ),
      )
      .orderBy(asc(offer.id))
      .for('update');

    for (const { id, inventoryLevel } of locked) {
      const remaining = inventoryLevel?.value;
      if (typeof remaining !== 'number') continue;

      await tx
        .update(offer)
        .set({
          inventoryLevel: {
            ...inventoryLevel,
            value: remaining + (found?.heldOfferStock?.[id] ?? 0),
          },
          updatedAt: new Date(),
        })
        .where(eq(offer.id, id));
    }

    await tx
      .update(order)
      .set({ heldOfferStock: null })
      .where(eq(order.id, orderId));

    return true;
  }

  private async record(
    entries: {
      ingredientId: string;
      quantity: number;
      unitCost?: string | null;
    }[],
    {
      productionBatchId,
      sourceByIngredientId,
      note,
      orderId,
      organizationId,
    }: {
      productionBatchId?: string;
      sourceByIngredientId?: Map<string, StockSource>;
      note?: string | null;
      orderId?: string;
      organizationId: string;
    },
    tx: Tx,
  ): Promise<{
    created: InventoryTransaction[];
    lowStock: LowStockReachedEvent['ingredients'];
  }> {
    if (!entries.length) return { created: [], lowStock: [] };

    const locked = await tx
      .select({
        id: ingredient.id,
        inventoryLevel: ingredient.inventoryLevel,
        lowStockThreshold: ingredient.lowStockThreshold,
        name: ingredient.name,
      })
      .from(ingredient)
      .where(
        inArray(
          ingredient.id,
          entries.map(({ ingredientId }) => ingredientId),
        ),
      )
      .orderBy(asc(ingredient.id))
      .for('update');

    if (sourceByIngredientId)
      for (const { ingredientId, quantity } of entries) {
        const before = locked.find(({ id }) => id === ingredientId);
        const source = sourceByIngredientId.get(ingredientId);
        if (
          before &&
          source &&
          Number(before.inventoryLevel) + quantity < -QUANTITY_TOLERANCE
        )
          throw new InsufficientStockError(source);
      }

    const created = await tx
      .insert(inventoryTransaction)
      .values(
        entries.map(({ ingredientId, quantity, unitCost }) => ({
          id: randomUUID(),
          productionBatchId,
          ingredientId,
          note,
          orderId,
          organizationId,
          quantity: String(quantity),
          unitCost,
        })),
      )
      .returning();

    const lowStock: LowStockReachedEvent['ingredients'] = [];
    for (const { ingredientId, quantity } of entries) {
      const [updated] = await tx
        .update(ingredient)
        .set({
          inventoryLevel: sql`${ingredient.inventoryLevel} + ${quantity}`,
        })
        .where(eq(ingredient.id, ingredientId))
        .returning({ inventoryLevel: ingredient.inventoryLevel });

      const before = locked.find(({ id }) => id === ingredientId);
      if (!updated || !before) continue;

      const level = Number(before.inventoryLevel);
      const nextLevel = Number(updated.inventoryLevel);
      const oversold =
        level >= -QUANTITY_TOLERANCE && nextLevel < -QUANTITY_TOLERANCE;
      const threshold = before.lowStockThreshold;
      const reachedThreshold =
        threshold !== null &&
        level > Number(threshold) &&
        nextLevel <= Number(threshold);

      if (oversold || reachedThreshold)
        lowStock.push({
          id: before.id,
          name: before.name,
          ...(oversold && { oversold }),
        });
    }

    return { created, lowStock };
  }
}
