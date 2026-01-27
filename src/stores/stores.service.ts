import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, SQL } from 'drizzle-orm';
import * as schema from 'src/db/schema';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

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
}
