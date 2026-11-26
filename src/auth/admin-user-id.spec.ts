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

describe('userId 傳成陣列時照 better-auth 轉成字串後的對象處理', () => {
  let client: PGlite;
  let db: Transaction;
  let auth: ReturnType<typeof betterAuth>;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const request = (path: string, body: unknown, as = 'ann') =>
    runWithAuthHookState(() =>
      runInAuthTransaction(db, () =>
        auth.handler(
          new Request(`${BASE_URL}/api/auth${path}`, {
            method: 'POST',
            headers: {
              'accept-language': 'zh-TW',
              'content-type': 'application/json',
              origin: BASE_URL,
              ...(cookies[as] && { cookie: cookies[as] }),
            },
            body: JSON.stringify(body),
          }),
        ),
      ),
    );

  const auditOf = async (resourceId: string) =>
    (
      await client.query<{ action: string; changes: Record<string, unknown> }>(
        `select action, changes from audit_log where resource_id = $1 order by created_at`,
        [resourceId],
      )
    ).rows;

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

    for (const name of ['ann', 'bo', 'cy']) {
      const signUp = await request('/sign-up/email', {
        email: `${name}@example.com`,
        firstName: name,
        name,
        password: 'password-1234',
      });
      expect(signUp.status).toBe(200);
    }
    await client.query(`update "user" set email_verified = true`);
    await client.query(
      `update "user" set role = 'admin' where email = 'ann@example.com'`,
    );
    const { rows } = await client.query<{ id: string; name: string }>(
      `select id, name from "user"`,
    );
    for (const { id, name } of rows) ids[name] = id;

    for (const name of ['ann', 'bo']) {
      const signIn = await request('/sign-in/email', {
        email: `${name}@example.com`,
        password: 'password-1234',
      });
      cookies[name] = signIn.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
    }

    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address)
       values ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
    await client.query(
      `insert into member (id, organization_id, user_id, role, joined_as_platform_admin, created_at)
       values ('m-bo', 'biru', $1, 'owner', false, now()), ('m-ann', 'biru', $2, 'owner', true, now())`,
      [ids.bo, ids.ann],
    );
    await client.query(
      `insert into team (id, name, organization_id, created_at) values ('t-bar', 'Bar', 'biru', now())`,
    );
    await client.query(
      `insert into team_member (id, team_id, user_id, created_at) values ('tm-ann', 't-bar', $1, now())`,
      [ids.ann],
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('remove-user 不能刪掉門市唯一的店主', async () => {
    const response = await request('/admin/remove-user', {
      userId: [ids.bo],
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'USER_IS_SOLE_ORGANIZATION_OWNER',
    });
    const { rows } = await client.query(`select id from "user" where id = $1`, [
      ids.bo,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('ban-user 的異動紀錄有停權前的狀態', async () => {
    const response = await request('/admin/ban-user', { userId: [ids.cy] });

    expect(response.status).toBe(200);
    expect(await auditOf(ids.cy)).toEqual([
      expect.objectContaining({
        action: 'update',
        changes: expect.objectContaining({
          banned: { before: false, after: true },
        }) as unknown,
      }),
    ]);
  });

  it('set-user-password 留下異動紀錄', async () => {
    const response = await request('/admin/set-user-password', {
      userId: [ids.bo],
      newPassword: 'password-5678',
    });

    expect(response.status).toBe(200);
    expect(await auditOf(ids.bo)).toEqual([
      {
        action: 'update',
        changes: { passwordReset: { before: false, after: true } },
      },
    ]);
  });

  it('店主不能把平台管理員移出小組', async () => {
    const response = await request(
      '/organization/remove-team-member',
      { teamId: 't-bar', userId: [ids.ann], organizationId: 'biru' },
      'bo',
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'PLATFORM_ADMIN_MEMBER_PROTECTED',
    });
    const { rows } = await client.query(
      `select id from team_member where id = 'tm-ann'`,
    );
    expect(rows).toHaveLength(1);
  });
});
