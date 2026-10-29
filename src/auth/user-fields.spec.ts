import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';

import { normalizeUserFields } from './user-fields.js';

describe('normalizeUserFields', () => {
  it('不碰沒有傳的欄位', () => {
    expect(normalizeUserFields({ name: 'Ann' })).toEqual({ name: 'Ann' });
  });

  it('去掉名的前後空白', () => {
    expect(normalizeUserFields({ firstName: ' Ann ' })).toEqual({
      firstName: 'Ann',
    });
  });

  it.each([[''], ['  '], [null], [123]])('名是 %j 時擋下', (firstName) => {
    expect(() => normalizeUserFields({ firstName })).toThrow(
      'firstName is required',
    );
  });

  it.each([[''], ['  '], [null]])('姓與電話是 %j 時清空成 null', (value) => {
    expect(
      normalizeUserFields({ lastName: value, phoneNumber: value }),
    ).toEqual({ lastName: null, phoneNumber: null });
  });

  it('姓與電話不是字串時擋下', () => {
    expect(() => normalizeUserFields({ lastName: 123 })).toThrow(
      'lastName must be a string',
    );
    expect(() => normalizeUserFields({ phoneNumber: 886912345678 })).toThrow(
      'phoneNumber must be a string',
    );
  });
});

describe('user_name_phone_not_blank', () => {
  let client: PGlite;

  beforeAll(async () => {
    client = createPGlite();
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: './drizzle',
    });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const insertUser = (id: string, columns: Record<string, string | null>) =>
    client.query(
      `insert into "user" (id, name, email, updated_at, first_name, last_name, phone_number)
       values ($1, 'Ann', $1 || '@example.com', now(), $2, $3, $4)`,
      [id, columns.firstName, columns.lastName, columns.phoneNumber],
    );

  it('允許沒有姓與電話', async () => {
    await expect(
      insertUser('a', { firstName: 'Ann', lastName: null, phoneNumber: null }),
    ).resolves.toBeDefined();
  });

  it.each([
    { firstName: ' ', lastName: null, phoneNumber: null },
    { firstName: 'Ann', lastName: '', phoneNumber: null },
    { firstName: 'Ann', lastName: null, phoneNumber: ' ' },
  ])('資料庫擋下空白值 %j', async (columns) => {
    await expect(insertUser('b', columns)).rejects.toThrow(
      'user_name_phone_not_blank',
    );
  });
});
