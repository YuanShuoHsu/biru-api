import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  buildDateFilterCondition,
  buildNumberFilterCondition,
  buildPlainDateFilterCondition,
} from './data-grid-filters.js';

const column = sql`created_at`;
const params = (condition: ReturnType<typeof buildDateFilterCondition>) =>
  new PgDialect().sqlToQuery(condition!).params;

describe.each([
  ['buildDateFilterCondition', buildDateFilterCondition],
  ['buildPlainDateFilterCondition', buildPlainDateFilterCondition],
])('%s', (_, build) => {
  it('合法日期照常產生條件', () => {
    expect(params(build(column, 'is', '2024-02-29'))).toContain('2024-02-29');
  });

  it.each([
    'abc',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '0000-01-01',
    '2026-1-1',
  ])('不合法的日期 %s 不產生條件，避免 ::date 轉型失敗', (value) => {
    expect(build(column, 'is', value)).toBeUndefined();
  });

  it('isEmpty 不需要值', () => {
    expect(build(column, 'isEmpty', '')).toBeDefined();
  });
});

describe('buildNumberFilterCondition', () => {
  const query = (operator: string, value: string) => {
    const condition = buildNumberFilterCondition(column, operator, value);
    return condition && new PgDialect().sqlToQuery(condition);
  };

  it('值以 numeric 比較，整數欄位也能用小數或超大數字篩選', () => {
    expect(query('>', '1.5')).toMatchObject({
      sql: 'created_at > $1::numeric',
      params: [1.5],
    });
    expect(query('=', '1e30')?.params).toEqual([1e30]);
    expect(query('isAnyOf', '1,,abc,2')).toMatchObject({
      sql: 'created_at in ($1::numeric, $2::numeric)',
      params: [1, 2],
    });
  });

  it.each(['abc', 'Infinity', '1e400'])(
    '不是有限數字的 %s 不產生條件',
    (value) => {
      expect(buildNumberFilterCondition(column, '=', value)).toBeUndefined();
    },
  );
});
