import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth/minimal';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readFileSync } from 'node:fs';

import { createPGlite } from '../../test/pglite.js';
import type { Transaction } from '../attendance/attendance-audit.js';
import * as schema from '../db/schema/index.js';

import { runInAuthTransaction } from './auth-transaction.js';
import { createAuthI18n } from './i18n.js';
import { authDatabase, createAuth } from './index.js';
import { normalizeUserFields } from './user-fields.js';

const BASE_URL = 'http://localhost:3001';

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

describe('經由 Better Auth 更新使用者', () => {
  let client: PGlite;
  let db: Transaction;
  let auth: ReturnType<typeof betterAuth>;
  let cookie: string;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as Transaction;

    const zhTW = JSON.parse(
      readFileSync('src/i18n/zh-TW/auth.json', 'utf8'),
    ) as Record<string, string>;
    const { options } = createAuth(
      { sendVerificationEmail: vi.fn() } as never,
      { issueSignupCoupons: vi.fn() } as never,
      createAuthI18n({ t: () => zhTW } as never),
    );
    auth = betterAuth({
      ...options,
      baseURL: BASE_URL,
      database: authDatabase(db),
      rateLimit: { enabled: false },
      secret: 'test-secret-test-secret-test-secret',
    }) as unknown as ReturnType<typeof betterAuth>;

    const signUp = await request('/sign-up/email', {
      email: 'ann@example.com',
      firstName: ' Ann ',
      lastName: ' ',
      name: 'Ann',
      password: 'password-1234',
    });
    expect(signUp.status).toBe(200);
    await client.query(
      `update "user" set email_verified = true where email = 'ann@example.com'`,
    );

    const signIn = await request('/sign-in/email', {
      email: 'ann@example.com',
      password: 'password-1234',
    });
    cookie = signIn.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const request = (path: string, body: unknown) =>
    runInAuthTransaction(db, () =>
      auth.handler(
        new Request(`${BASE_URL}/api/auth${path}`, {
          method: 'POST',
          headers: {
            'accept-language': 'zh-TW',
            'content-type': 'application/json',
            origin: BASE_URL,
            ...(cookie && { cookie }),
          },
          body: JSON.stringify(body),
        }),
      ),
    );

  const columns = async () => {
    const { rows } = await client.query<{
      first_name: string;
      last_name: string | null;
      phone_number: string | null;
    }>(
      `select first_name, last_name, phone_number from "user" where email = 'ann@example.com'`,
    );

    return rows[0];
  };

  it('註冊時去掉名的空白，空白的姓存成 null', async () => {
    expect(await columns()).toEqual({
      first_name: 'Ann',
      last_name: null,
      phone_number: null,
    });
  });

  it('註冊時名是空白就擋下並回傳使用者語系的訊息', async () => {
    const response = await request('/sign-up/email', {
      email: 'bo@example.com',
      firstName: '  ',
      name: 'Bo',
      password: 'password-1234',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'FIRST_NAME_REQUIRED',
      message: '請輸入名字',
    });
  });

  it('可以填入再清空姓與電話', async () => {
    const fill = await request('/update-user', {
      lastName: 'Lee',
      phoneNumber: '+886912345678',
    });
    expect(fill.status).toBe(200);
    expect(await columns()).toMatchObject({
      last_name: 'Lee',
      phone_number: '+886912345678',
    });

    const clear = await request('/update-user', {
      lastName: '',
      phoneNumber: '',
    });
    expect(clear.status).toBe(200);
    expect(await columns()).toMatchObject({
      last_name: null,
      phone_number: null,
    });
  });

  it('不能清空名', async () => {
    const response = await request('/update-user', { firstName: '' });

    expect(response.status).toBe(400);
    expect(await columns()).toMatchObject({ first_name: 'Ann' });
  });
});
