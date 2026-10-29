import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';

import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from '../common/utils/data-grid-filters.js';
import {
  ingredient,
  inventoryTransaction,
  recipe,
  recipeIngredient,
} from '../db/schema/inventory.js';
import { offer } from '../db/schema/menus.js';
import { order, orderItem } from '../db/schema/orders.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import type { LowStockReachedEvent } from '../events/low-stock-reached.event.js';

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
import { notFoundError } from './inventory-errors.js';
import { QUANTITY_TOLERANCE } from './menu-stock.service.js';
import { unitPriceOf } from './pricing.js';

type Tx = Pick<DrizzleDB, 'insert' | 'select' | 'update'>;

export class InsufficientStockError extends Error {
  constructor(readonly menuItemId: string) {
    super(`Insufficient stock for MenuItem ${menuItemId}`);
  }
}

@Injectable()
export class InventoryTransactionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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
      throw new ForbiddenException();

    const reason = sql<InventoryTransactionReason>`case
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
          ilike(sql`${inventoryTransaction.quantity}::text`, `%${value}%`),
          ...(canReadPurchasing
            ? [ilike(sql`${inventoryTransaction.unitCost}::text`, `%${value}%`)]
            : []),
          ilike(inventoryTransaction.note, `%${value}%`),
          ilike(order.orderNumber, `%${value}%`),
          ilike(localTimeText(inventoryTransaction.createdAt), `%${value}%`),
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
        eligibleQuantity: ingredient.eligibleQuantity,
        eligibleQuantityUnitCode: ingredient.eligibleQuantityUnitCode,
        price: ingredient.price,
      })
      .from(ingredient)
      .where(eq(ingredient.id, ingredientId))
      .for('update');
    if (!found) throw notFoundError('ingredientNotFound');

    const inventoryLevel = Number(dto.inventoryLevel);
    const quantity = inventoryLevel - Number(found.inventoryLevel);
    const unitPrice = unitPriceOf(found)?.toString() ?? null;

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
        orderQuantity: orderItem.orderQuantity,
      })
      .from(orderItem)
      .where(eq(orderItem.orderId, orderId));

    const servingsByMenuItemId = new Map<string, number>();
    for (const { addOns, menuItemId, orderQuantity } of items)
      for (const id of [
        menuItemId,
        ...(addOns ?? []).map((addOn) => addOn.menuItemId),
      ])
        servingsByMenuItemId.set(
          id,
          (servingsByMenuItemId.get(id) ?? 0) + orderQuantity,
        );
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
        recipeYield: recipe.recipeYield,
      })
      .from(recipe)
      .where(inArray(recipe.menuItemId, [...servingsByMenuItemId.keys()]));
    if (!recipes.length) return { lowStock: [], offerStockChanged };

    const materials = await tx
      .select()
      .from(recipeIngredient)
      .where(
        inArray(
          recipeIngredient.recipeId,
          recipes.map(({ id }) => id),
        ),
      );

    const quantities = new Map<string, number>();
    const menuItemIdByIngredientId = new Map<string, string>();
    for (const { id, menuItemId, recipeYield } of recipes) {
      const servings =
        (menuItemId && servingsByMenuItemId.get(menuItemId)) || 0;

      for (const material of materials.filter(
        ({ recipeId }) => recipeId === id,
      )) {
        const used =
          (Number(material.requiredQuantity) / recipeYield) * servings;
        quantities.set(
          material.ingredientId,
          (quantities.get(material.ingredientId) ?? 0) + used,
        );
        if (menuItemId && !menuItemIdByIngredientId.has(material.ingredientId))
          menuItemIdByIngredientId.set(material.ingredientId, menuItemId);
      }
    }

    const lowStock = await this.record(
      [...quantities].map(([ingredientId, used]) => ({
        ingredientId,
        quantity: -used,
      })),
      {
        ...(enforceStock && { menuItemIdByIngredientId }),
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
        throw new InsufficientStockError(menuItemId);

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
    entries: { ingredientId: string; quantity: number }[],
    {
      menuItemIdByIngredientId,
      orderId,
      organizationId,
    }: {
      menuItemIdByIngredientId?: Map<string, string>;
      orderId: string;
      organizationId: string;
    },
    tx: Tx,
  ): Promise<LowStockReachedEvent['ingredients']> {
    if (!entries.length) return [];

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

    if (menuItemIdByIngredientId)
      for (const { ingredientId, quantity } of entries) {
        const before = locked.find(({ id }) => id === ingredientId);
        const menuItemId = menuItemIdByIngredientId.get(ingredientId);
        if (
          before &&
          menuItemId &&
          Number(before.inventoryLevel) + quantity < -QUANTITY_TOLERANCE
        )
          throw new InsufficientStockError(menuItemId);
      }

    await tx.insert(inventoryTransaction).values(
      entries.map(({ ingredientId, quantity }) => ({
        id: randomUUID(),
        ingredientId,
        orderId,
        organizationId,
        quantity: String(quantity),
      })),
    );

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
      if (!updated || !before || before.lowStockThreshold === null) continue;

      const threshold = Number(before.lowStockThreshold);
      if (
        Number(before.inventoryLevel) > threshold &&
        Number(updated.inventoryLevel) <= threshold
      )
        lowStock.push({ id: before.id, name: before.name });
    }

    return lowStock;
  }
}
