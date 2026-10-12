import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';

import * as schema from 'src/db/schema';

const TABLES_BY_NAME = new Map<string, PgTable>(
  Object.values(schema).flatMap((value) =>
    is(value, PgTable) ? [[getTableName(value), value] as const] : [],
  ),
);

// deleted_record 存的是 to_jsonb(OLD)，鍵是資料庫欄位名；轉回 Drizzle 欄位名
export const toCamelRow = (
  tableName: string,
  data: Record<string, unknown>,
): Record<string, unknown> => {
  const table = TABLES_BY_NAME.get(tableName);
  if (!table) return data;

  return Object.fromEntries(
    Object.entries(getTableColumns(table)).map(([key, column]) => [
      key,
      data[column.name],
    ]),
  );
};

export const asString = (value: unknown) =>
  typeof value === 'string' ? value : null;

export const asNumber = (value: unknown) =>
  typeof value === 'number' ? value : null;

export const asBoolean = (value: unknown) =>
  typeof value === 'boolean' ? value : null;

export const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

export const asPeriods = (value: unknown): { from: string; to: string }[] =>
  Array.isArray(value)
    ? value.flatMap((item: unknown) => {
        if (typeof item !== 'object' || item === null) return [];
        const from = 'from' in item ? asString(item.from) : null;
        const to = 'to' in item ? asString(item.to) : null;

        return from && to ? [{ from, to }] : [];
      })
    : [];
