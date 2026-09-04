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
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';

import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import {
  ingredient,
  inventoryTransaction,
  recipe,
  recipeIngredient,
} from 'src/db/schema/inventory';
import { order, orderItem } from 'src/db/schema/orders';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import { CreateInventoryTransactionDto } from './dto/create-inventory-transaction.dto';
import {
  INVENTORY_TRANSACTION_DATE_FILTER_FIELDS,
  INVENTORY_TRANSACTION_ENUM_FILTER_FIELDS,
  INVENTORY_TRANSACTION_NUMBER_FILTER_FIELDS,
  INVENTORY_TRANSACTION_STRING_FILTER_FIELDS,
  InventoryTransactionPaginationQueryDto,
} from './dto/inventory-transaction-pagination-query.dto';
import { InventoryTransactionResponseDto } from './dto/inventory-transaction-response.dto';

type Tx = Pick<DrizzleDB, 'insert' | 'select' | 'update'>;

@Injectable()
export class InventoryTransactionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll(
    ingredientId: string,
    query: InventoryTransactionPaginationQueryDto = {},
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

    const fieldMap: Record<string, Column | SQL> = {
      type: sql`${inventoryTransaction.type}::text`,
      quantity: inventoryTransaction.quantity,
      unitCost: inventoryTransaction.unitCost,
      note: inventoryTransaction.note,
      createdAt: inventoryTransaction.createdAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [dir(fieldMap[sortBy])]
      : [desc(inventoryTransaction.createdAt)];

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
          ilike(inventoryTransaction.quantity, `%${value}%`),
          ilike(inventoryTransaction.unitCost, `%${value}%`),
          ilike(inventoryTransaction.note, `%${value}%`),
          ilike(localTimeText(inventoryTransaction.createdAt), `%${value}%`),
        ],
      }),
    );

    const [data, [{ total }]] = await Promise.all([
      this.db.query.inventoryTransaction.findMany({
        where,
        orderBy,
        limit,
        offset,
      }),
      this.db
        .select({ total: count() })
        .from(inventoryTransaction)
        .where(where),
    ]);

    return { data, total };
  }

  async create(
    ingredientId: string,
    dto: CreateInventoryTransactionDto,
  ): Promise<InventoryTransactionResponseDto> {
    return this.db.transaction(async (tx) => {
      const [found] = await tx
        .select({
          organizationId: ingredient.organizationId,
          inventoryLevel: ingredient.inventoryLevel,
        })
        .from(ingredient)
        .where(eq(ingredient.id, ingredientId))
        .for('update');
      if (!found) throw new NotFoundException('Ingredient not found');

      // 盤點送的是清點後的實數，其餘型別送的是異動量
      const quantity =
        dto.type === 'adjustment'
          ? Number(dto.quantity) - Number(found.inventoryLevel)
          : Number(dto.quantity) * (dto.type === 'purchase' ? 1 : -1);

      const [created] = await tx
        .insert(inventoryTransaction)
        .values({
          id: randomUUID(),
          ingredientId,
          note: dto.note,
          organizationId: found.organizationId,
          quantity: String(quantity),
          type: dto.type,
          unitCost: dto.unitCost,
        })
        .returning();

      await tx
        .update(ingredient)
        .set({
          inventoryLevel: sql`${ingredient.inventoryLevel} + ${quantity}`,
        })
        .where(eq(ingredient.id, ingredientId));

      return created;
    });
  }

  async consume(orderId: string, tx: Tx): Promise<void> {
    const [placed] = await tx
      .select({ sellerId: order.sellerId })
      .from(order)
      .where(eq(order.id, orderId));
    if (!placed?.sellerId) return;

    const items = await tx
      .select({
        menuItemId: orderItem.menuItemId,
        orderQuantity: orderItem.orderQuantity,
      })
      .from(orderItem)
      .where(eq(orderItem.orderId, orderId));
    if (!items.length) return;

    const recipes = await tx
      .select({
        id: recipe.id,
        menuItemId: recipe.menuItemId,
        recipeYield: recipe.recipeYield,
      })
      .from(recipe)
      .where(
        inArray(
          recipe.menuItemId,
          items.map(({ menuItemId }) => menuItemId),
        ),
      );
    if (!recipes.length) return;

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
    for (const { id, menuItemId, recipeYield } of recipes) {
      const servings = items
        .filter((item) => item.menuItemId === menuItemId)
        .reduce((sum, { orderQuantity }) => sum + orderQuantity, 0);

      for (const material of materials.filter(
        ({ recipeId }) => recipeId === id,
      )) {
        const used =
          (Number(material.requiredQuantity) / recipeYield) * servings;
        quantities.set(
          material.ingredientId,
          (quantities.get(material.ingredientId) ?? 0) + used,
        );
      }
    }

    await this.record(
      [...quantities].map(([ingredientId, used]) => ({
        ingredientId,
        quantity: -used,
      })),
      { orderId, organizationId: placed.sellerId, type: 'consumption' },
      tx,
    );
  }

  async restore(orderId: string, tx: Tx): Promise<void> {
    const rows = await tx
      .select({
        ingredientId: inventoryTransaction.ingredientId,
        organizationId: inventoryTransaction.organizationId,
        quantity: inventoryTransaction.quantity,
        type: inventoryTransaction.type,
      })
      .from(inventoryTransaction)
      .where(eq(inventoryTransaction.orderId, orderId));

    if (rows.some(({ type }) => type === 'restoration')) return;

    const consumptions = rows.filter(({ type }) => type === 'consumption');
    if (!consumptions.length) return;

    await this.record(
      consumptions.map(({ ingredientId, quantity }) => ({
        ingredientId,
        quantity: -Number(quantity),
      })),
      {
        orderId,
        organizationId: consumptions[0].organizationId,
        type: 'restoration',
      },
      tx,
    );
  }

  private async record(
    entries: { ingredientId: string; quantity: number }[],
    {
      orderId,
      organizationId,
      type,
    }: {
      orderId: string;
      organizationId: string;
      type: 'consumption' | 'restoration';
    },
    tx: Tx,
  ): Promise<void> {
    if (!entries.length) return;

    await tx.insert(inventoryTransaction).values(
      entries.map(({ ingredientId, quantity }) => ({
        id: randomUUID(),
        ingredientId,
        orderId,
        organizationId,
        quantity: String(quantity),
        type,
      })),
    );

    for (const { ingredientId, quantity } of entries) {
      await tx
        .update(ingredient)
        .set({
          inventoryLevel: sql`${ingredient.inventoryLevel} + ${quantity}`,
        })
        .where(eq(ingredient.id, ingredientId));
    }
  }
}
