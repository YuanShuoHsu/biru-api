import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth/minimal';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readFileSync } from 'node:fs';

import { createPGlite } from '../../test/pglite.js';
import type { Transaction } from '../attendance/attendance-audit.js';
import * as schema from '../db/schema/index.js';

import { runInAuthTransaction } from './auth-transaction.js';
import { runWithAuthHookState } from './hooks.js';
import { createAuthI18n } from './i18n.js';
import { authDatabase, createAuth } from './index.js';

const BASE_URL = 'http://localhost:3001';

describe('平台管理員不能改自己的平台角色', () => {
  let client: PGlite;
  let db: Transaction;
  let auth: ReturnType<typeof betterAuth>;
  let cookie = '';
  let annId: string;
  let boId: string;

  const request = (path: string, body: unknown) =>
    runWithAuthHookState(() =>
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
      ),
    );

  const roleOf = async (id: string) =>
    (
      await client.query<{ role: string }>(
        `select role from "user" where id = $1`,
        [id],
      )
    ).rows[0].role;

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
      {} as never,
    );
    auth = betterAuth({
      ...options,
      baseURL: BASE_URL,
      database: authDatabase(db),
      rateLimit: { enabled: false },
      secret: 'test-secret-test-secret-test-secret',
    }) as unknown as ReturnType<typeof betterAuth>;

    for (const [email, name] of [
      ['ann@example.com', 'Ann'],
      ['bo@example.com', 'Bo'],
    ])
      expect(
        (
          await request('/sign-up/email', {
            email,
            firstName: name,
            name,
            password: 'password-1234',
          })
        ).status,
      ).toBe(200);
    await client.query(
      `update "user" set email_verified = true, role = 'admin' where email = 'ann@example.com'`,
    );
    const { rows } = await client.query<{ id: string; email: string }>(
      `select id, email from "user"`,
    );
    annId = rows.find((row) => row.email === 'ann@example.com')!.id;
    boId = rows.find((row) => row.email === 'bo@example.com')!.id;

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

  it('用 set-role 改自己的角色時擋下並回傳使用者語系的訊息', async () => {
    const response = await request('/admin/set-role', {
      userId: annId,
      role: 'user',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'YOU_CANNOT_CHANGE_YOUR_OWN_ROLE',
      message: '您無法變更自己的角色',
    });
    expect(await roleOf(annId)).toBe('admin');
  });

  it('用 update-user 帶 role 改自己時擋下，其他欄位也不會寫入', async () => {
    const response = await request('/admin/update-user', {
      userId: annId,
      data: { role: 'user', lastName: 'Lee' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'YOU_CANNOT_CHANGE_YOUR_OWN_ROLE',
    });
    expect(await roleOf(annId)).toBe('admin');
  });

  it('用 update-user 改自己但沒帶 role 時照常更新', async () => {
    const response = await request('/admin/update-user', {
      userId: annId,
      data: { lastName: 'Lee' },
    });

    expect(response.status).toBe(200);
    expect(
      (
        await client.query<{ last_name: string }>(
          `select last_name from "user" where id = $1`,
          [annId],
        )
      ).rows[0].last_name,
    ).toBe('Lee');
  });

  it('改別人的角色照常', async () => {
    const setRole = await request('/admin/set-role', {
      userId: boId,
      role: 'admin',
    });
    expect(setRole.status).toBe(200);
    expect(await roleOf(boId)).toBe('admin');

    const updateUser = await request('/admin/update-user', {
      userId: boId,
      data: { role: 'user' },
    });
    expect(updateUser.status).toBe(200);
    expect(await roleOf(boId)).toBe('user');
  });
});
