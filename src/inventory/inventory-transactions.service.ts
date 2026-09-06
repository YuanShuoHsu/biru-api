import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import {
  InventoryTransactionResponseDto,
  type InventoryTransactionReason,
} from './dto/inventory-transaction-response.dto';
import { unitPriceOf } from './pricing';

type Tx = Pick<DrizzleDB, 'insert' | 'select' | 'update'>;

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

    const fieldMap: Record<string, Column | SQL> = {
      quantity: inventoryTransaction.quantity,
      unitCost: inventoryTransaction.unitCost,
      note: inventoryTransaction.note,
      reason,
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
          orderNumber: order.orderNumber,
          reason,
        })
        .from(inventoryTransaction)
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
          orderNumber,
          reason,
        }) => ({
          ...row,
          ...(canReadPurchasing && { unitCost }),
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

    return canReadPurchasing ? created : { ...created, unitCost: undefined };
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
    if (!found) throw new NotFoundException('Ingredient not found');

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

    await tx
      .update(ingredient)
      .set({ inventoryLevel: String(inventoryLevel) })
      .where(eq(ingredient.id, ingredientId));

    return { ...created, orderNumber: null, reason: 'count' };
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
      { orderId, organizationId: placed.sellerId },
      tx,
    );
  }

  async restoreAll(orderId: string, tx: Tx): Promise<void> {
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
    if (!entries.length) return;

    await this.record(
      entries,
      { orderId, organizationId: rows[0].organizationId },
      tx,
    );
  }

  private async record(
    entries: { ingredientId: string; quantity: number }[],
    {
      orderId,
      organizationId,
    }: {
      orderId: string;
      organizationId: string;
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
