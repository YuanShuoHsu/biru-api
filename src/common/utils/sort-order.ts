import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

type SortableTable = PgTable & { id: PgColumn; sortOrder: PgColumn };

export async function reorderSortOrders(
  db: DrizzleDB,
  table: SortableTable,
  ids: string[],
  scope?: SQL,
): Promise<void> {
  await db.transaction(async (tx) => {
    // https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE
    const rows = (await tx
      .select({ id: table.id, sortOrder: table.sortOrder })
      .from(table as PgTable)
      .where(and(inArray(table.id, ids), scope))
      .orderBy(asc(table.id))
      .for('update')) as { id: string; sortOrder: number }[];

    const current = new Map(rows.map((row) => [row.id, row.sortOrder]));
    const values = rows.map((row) => row.sortOrder).sort((a, b) => a - b);
    let previous = -Infinity;
    for (const [i, id] of ids.filter((id) => current.has(id)).entries()) {
      const sortOrder = Math.max(values[i], previous + 1);
      previous = sortOrder;
      if (sortOrder === current.get(id)) continue;
      await tx
        .update(table)
        .set({ sortOrder } as never)
        .where(eq(table.id, id));
    }
  });
}
