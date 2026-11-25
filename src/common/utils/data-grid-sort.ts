import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';

import type { SortDirection } from '../constants/pagination.js';

export type NullsAs = 'last' | 'highest' | 'lowest';

// https://www.postgresql.org/docs/current/queries-order.html
// https://www.postgresql.org/docs/current/indexes-ordering.html
// 不可為 null 的欄位不要傳 nulls：NULLS 位置與索引預設不同時，索引無法用來排序
export const orderByDirection = (
  column: SQLWrapper,
  direction: SortDirection,
  nulls?: NullsAs,
): SQL => {
  const descending = direction === 'desc';
  const order = sql.raw(descending ? 'desc' : 'asc');
  if (!nulls) return sql`${column} ${order}`;

  const nullsFirst =
    nulls === 'highest' ? descending : nulls === 'lowest' && !descending;

  return sql`${column} ${order} ${sql.raw(nullsFirst ? 'nulls first' : 'nulls last')}`;
};
