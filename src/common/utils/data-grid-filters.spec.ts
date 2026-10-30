import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  buildDateFilterCondition,
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
