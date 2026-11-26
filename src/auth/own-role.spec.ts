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
  let cyId: string;

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

  const lastNameOf = async (id: string) =>
    (
      await client.query<{ last_name: string | null }>(
        `select last_name from "user" where id = $1`,
        [id],
      )
    ).rows[0].last_name;

  const platformAdminMemberships = async (userId: string) =>
    (
      await client.query<{ id: string }>(
        `select id from member where user_id = $1 and joined_as_platform_admin`,
        [userId],
      )
    ).rows.map(({ id }) => id);

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
      ['cy@example.com', 'Cy'],
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
      `update "user" set email_verified = true, role = 'admin' where email in ('ann@example.com', 'cy@example.com')`,
    );
    const { rows } = await client.query<{ id: string; email: string }>(
      `select id, email from "user"`,
    );
    annId = rows.find((row) => row.email === 'ann@example.com')!.id;
    boId = rows.find((row) => row.email === 'bo@example.com')!.id;
    cyId = rows.find((row) => row.email === 'cy@example.com')!.id;
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address)
       values ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
    await client.query(
      `insert into member (id, organization_id, user_id, role, joined_as_platform_admin, created_at)
       values ('m-ann', 'biru', $1, 'owner', true, now()), ('m-cy', 'biru', $2, 'owner', true, now())`,
      [annId, cyId],
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
    expect(await platformAdminMemberships(annId)).toEqual(['m-ann']);
  });

  it.each([
    ['/admin/set-role', (id: string) => ({ userId: [id], role: 'user' })],
    [
      '/admin/update-user',
      (id: string) => ({ userId: [id], data: { role: 'user' } }),
    ],
  ])('%s 的 userId 傳成陣列也擋下', async (path, body) => {
    const response = await request(path, body(annId));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'YOU_CANNOT_CHANGE_YOUR_OWN_ROLE',
    });
    expect(await roleOf(annId)).toBe('admin');
  });

  it('角色含多個值的平台管理員也不能改自己', async () => {
    await client.query(`update "user" set role = 'admin,user' where id = $1`, [
      annId,
    ]);
    try {
      const response = await request('/admin/set-role', {
        userId: annId,
        role: 'user',
      });

      expect(response.status).toBe(400);
      expect(await roleOf(annId)).toBe('admin,user');
    } finally {
      await client.query(`update "user" set role = 'admin' where id = $1`, [
        annId,
      ]);
    }
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
    expect(await lastNameOf(annId)).toBeNull();
  });

  it('用 update-user 改自己但沒帶 role 時照常更新', async () => {
    const response = await request('/admin/update-user', {
      userId: annId,
      data: { lastName: 'Lee' },
    });

    expect(response.status).toBe(200);
    expect(await lastNameOf(annId)).toBe('Lee');
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

  it('userId 傳成陣列降級另一位平台管理員時，清掉他以平台管理員身分加入的成員資格', async () => {
    const response = await request('/admin/set-role', {
      userId: [cyId],
      role: 'user',
    });

    expect(response.status).toBe(200);
    expect(await roleOf(cyId)).toBe('user');
    expect(await platformAdminMemberships(cyId)).toEqual([]);
    expect(await platformAdminMemberships(annId)).toEqual(['m-ann']);
  });
});
