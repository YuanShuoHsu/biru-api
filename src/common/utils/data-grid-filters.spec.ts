import { readdirSync, readFileSync } from 'node:fs';

import type { PGlite } from '@electric-sql/pglite';
import { Column, SQL, sql } from 'drizzle-orm';
import { PgDialect, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { createPGlite } from '../../../test/pglite.js';

import {
  buildDateFilterCondition,
  buildNumberFilterCondition,
  buildPlainDateFilterCondition,
  buildStringFilterCondition,
  localTimeText,
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

describe('buildDateFilterCondition 依台北日界比對原欄位', () => {
  const filterDates = pgTable('filter_dates', {
    id: text('id').primaryKey(),
    plainAt: timestamp('plain_at'),
    instantAt: timestamp('instant_at', { withTimezone: true }),
  });
  let client: PGlite;

  const query = (condition: SQL) => new PgDialect().sqlToQuery(condition);

  const matches = async (column: Column | SQL, operator: string) => {
    const { sql: where, params } = query(
      buildDateFilterCondition(column, operator, '2026-11-12')!,
    );
    const { rows } = await client.query<{ id: string }>(
      `select id from filter_dates where ${where} order by id`,
      params,
    );
    return rows.map(({ id }) => id);
  };

  beforeAll(async () => {
    client = createPGlite();
    await client.exec(`
      create table filter_dates (id text primary key, plain_at timestamp, instant_at timestamptz);
      create index on filter_dates (plain_at);
      create index on filter_dates (instant_at);
      insert into filter_dates values
        ('a', '2026-11-11 15:59:59', '2026-11-11T15:59:59Z'),
        ('b', '2026-11-11 16:00:00', '2026-11-11T16:00:00Z'),
        ('c', '2026-11-12 15:59:59', '2026-11-12T15:59:59Z'),
        ('d', '2026-11-12 16:00:00', '2026-11-12T16:00:00Z'),
        ('e', null, null);
    `);
  });

  afterAll(async () => {
    await client.close();
  });

  describe.each(['UTC', 'America/New_York'])('連線時區 %s', (timeZone) => {
    beforeAll(async () => {
      await client.exec(`set timezone = '${timeZone}'`);
    });

    describe.each([
      ['timestamp 欄位', filterDates.plainAt],
      ['timestamp 運算式', sql`plain_at`],
      ['timestamptz 欄位', filterDates.instantAt],
      [
        '轉成 UTC timestamp 的 timestamptz 運算式',
        sql`(instant_at) AT TIME ZONE 'UTC'`,
      ],
    ])('%s', (_, column) => {
      it.each([
        ['is', ['b', 'c']],
        ['not', ['a', 'd']],
        ['after', ['d']],
        ['onOrAfter', ['b', 'c', 'd']],
        ['before', ['a']],
        ['onOrBefore', ['a', 'b', 'c']],
        ['isEmpty', ['e']],
        ['isNotEmpty', ['a', 'b', 'c', 'd']],
      ])('%s 2026-11-12', async (operator, expected) => {
        expect(await matches(column, operator)).toEqual(expected);
      });

      it('localTimeText 顯示台北時間', async () => {
        const { sql: text, params } = query(localTimeText(column));
        const { rows } = await client.query<{ time: string }>(
          `select ${text} as time from filter_dates where id = 'b'`,
          params,
        );
        expect(rows).toEqual([{ time: '2026/11/12 00:00:00' }]);
      });
    });
  });

  it.each([
    ['plain_at', filterDates.plainAt],
    ['instant_at', filterDates.instantAt],
  ])('%s 的索引能用於日期篩選', async (_, column) => {
    const { sql: where, params } = query(
      buildDateFilterCondition(column, 'is', '2026-11-12')!,
    );
    await client.exec('set enable_seqscan = off');
    const { rows } = await client
      .query<{ 'QUERY PLAN': string }>(
        `explain select id from filter_dates where ${where}`,
        params,
      )
      .finally(() => client.exec('reset enable_seqscan'));

    expect(rows.map((row) => row['QUERY PLAN']).join('\n')).toMatch(
      /Index (Only )?Scan|Bitmap Index Scan/,
    );
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

describe('buildStringFilterCondition 的 LIKE 比對', () => {
  let client: PGlite;

  const matches = async (operator: string, value: string) => {
    const condition = buildStringFilterCondition(sql`name`, operator, value);
    const { sql: where, params } = new PgDialect().sqlToQuery(condition!);
    const { rows } = await client.query<{ name: string }>(
      `select name from (values ('100%'), ('1000'), ('a_b'), ('axb'), ('c:\\d'), ('c:d')) t(name) where ${where} order by name`,
      params,
    );
    return rows.map(({ name }) => name);
  };

  beforeAll(() => {
    client = createPGlite();
  });

  afterAll(async () => {
    await client.close();
  });

  it.each([
    ['contains', '%', ['100%']],
    ['contains', '_', ['a_b']],
    ['contains', '\\', ['c:\\d']],
    ['startsWith', 'a_', ['a_b']],
    ['endsWith', '0%', ['100%']],
    ['doesNotContain', '_', ['100%', '1000', 'axb', 'c:\\d', 'c:d']],
  ])('%s %s 把萬用字元當成一般字元', async (operator, value, expected) => {
    expect(await matches(operator, value)).toEqual(expected);
  });
});

describe('LIKE 樣式', () => {
  it('src 裡以輸入值組成的樣式都先經過 escapeLike', () => {
    const offenders = readdirSync('src', { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .filter((file) =>
        /`%\$\{[\w.]+\}%?`|`\$\{[\w.]+\}%`/.test(
          readFileSync(`src/${file}`, 'utf8'),
        ),
      );

    expect(offenders).toEqual([]);
  });
});
