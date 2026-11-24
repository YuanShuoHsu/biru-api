import type { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';

import { createPGlite } from '../../../test/pglite.js';

import { type NullsAs, orderByDirection } from './data-grid-sort.js';

describe('orderByDirection', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle>;

  beforeAll(() => {
    client = createPGlite();
    db = drizzle(client);
  });

  afterAll(async () => {
    await client.close();
  });

  it.each([
    [undefined, 'asc', [1, 2, null]],
    [undefined, 'desc', [null, 2, 1]],
    ['last', 'asc', [1, 2, null]],
    ['last', 'desc', [2, 1, null]],
    ['highest', 'asc', [1, 2, null]],
    ['highest', 'desc', [null, 2, 1]],
    ['lowest', 'asc', [null, 1, 2]],
    ['lowest', 'desc', [2, 1, null]],
  ] as const)(
    'nulls %s, %s',
    async (nulls: NullsAs | undefined, direction, expected) => {
      const { rows } = await db.execute<{ value: number | null }>(
        sql`select value from (values (2), (null), (1)) as t(value) order by ${orderByDirection(sql`value`, direction, nulls)}`,
      );

      expect(rows.map(({ value }) => value)).toEqual(expected);
    },
  );
});
