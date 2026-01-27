import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, SQL } from 'drizzle-orm';
import * as schema from 'src/db/schema';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { ReadMenuDto } from './dto/read-menu.dto';

type Store = typeof schema.stores.$inferSelect;
type CreateStore = typeof schema.stores.$inferInsert;

@Injectable()
export class StoresService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async store(where: { id: string }): Promise<Store | null> {
    const result = await this.db.query.stores.findFirst({
      where: eq(schema.stores.id, where.id),
    });
    return result || null;
  }

  async stores(params: {
    offset?: number;
    limit?: number;
    cursor?: { id: string };
    where?: SQL;
    orderBy?: SQL | SQL[];
  }): Promise<Store[]> {
    const { offset, limit, cursor, where, orderBy } = params;
    return this.db.query.stores.findMany({
      where: (stores) =>
        and(where, cursor?.id ? gte(stores.id, cursor.id) : undefined),
      orderBy,
      limit,
      offset,
    });
  }

  async createStore(data: CreateStore): Promise<Store> {
    const [store] = await this.db
      .insert(schema.stores)
      .values(data)
      .returning();
    return store;
  }

  async updateStore(params: {
    where: { id: string };
    data: Partial<CreateStore>;
  }): Promise<Store> {
    const { where, data } = params;
    const [store] = await this.db
      .update(schema.stores)
      .set(data)
      .where(eq(schema.stores.id, where.id))
      .returning();
    return store;
  }

  async deleteStore(where: { id: string }): Promise<Store> {
    const [store] = await this.db
      .delete(schema.stores)
      .where(eq(schema.stores.id, where.id))
      .returning();
    return store;
  }

  async menus(params: {
    offset?: number;
    limit?: number;
    cursor?: { id: string };
    where?: SQL;
    orderBy?: SQL | SQL[];
    id?: string;
  }): Promise<ReadMenuDto[]> {
    const { offset, limit, cursor, where, orderBy, id } = params;
    return this.db.query.menus.findMany({
      where: (menus) => {
        const filters: (SQL | undefined)[] = [where];
        if (id) filters.push(eq(menus.storeId, id));
        filters.push(eq(menus.isActive, true));

        const combinedFilters = filters.filter(Boolean) as SQL[];
        return combinedFilters.length > 0 ? and(...combinedFilters) : undefined;
      },
      orderBy: orderBy || ((menus, { asc }) => asc(menus.createdAt)),
      limit,
      offset,
      with: {
        items: {
          where: eq(schema.menuItems.isActive, true),
          orderBy: [asc(schema.menuItems.createdAt)],
          with: {
            ingredients: {
              orderBy: [asc(schema.menuItemIngredients.createdAt)],
            },
            options: {
              where: eq(schema.menuItemOptions.isActive, true),
              orderBy: [asc(schema.menuItemOptions.createdAt)],
              with: {
                choices: {
                  where: eq(schema.menuItemOptionChoices.isActive, true),
                  orderBy: [asc(schema.menuItemOptionChoices.createdAt)],
                  with: {
                    ingredients: {
                      orderBy: [
                        asc(schema.menuItemOptionChoiceIngredients.createdAt),
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }
}
