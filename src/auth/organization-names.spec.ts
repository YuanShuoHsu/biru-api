import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth/minimal';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import type { Transaction } from '../attendance/attendance-audit.js';
import * as schema from '../db/schema/index.js';

import { runInAuthTransaction } from './auth-transaction.js';
import { runWithAuthHookState } from './hooks.js';
import { createAuthI18n } from './i18n.js';
import { authDatabase, createAuth } from './index.js';

const BASE_URL = 'http://localhost:3001';

const ADDRESS = {
  addressCountry: 'TW',
  addressLocality: '大園區',
  addressRegion: '桃園市',
  streetAddress: '中正東路 1 號',
};

describe('門市與團隊名稱不能只有空白', () => {
  let client: PGlite;
  let db: Transaction;
  let auth: ReturnType<typeof betterAuth>;
  let cookie = '';
  let organizationId: string;
  let teamId: string;

  const request = (path: string, body: unknown) =>
    runWithAuthHookState(() =>
      runInAuthTransaction(db, () =>
        auth.handler(
          new Request(`${BASE_URL}/api/auth${path}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              origin: BASE_URL,
              ...(cookie && { cookie }),
            },
            body: JSON.stringify(body),
          }),
        ),
      ),
    );

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as Transaction;

    const { options } = createAuth(
      { sendVerificationEmail: vi.fn() } as never,
      { issueSignupCoupons: vi.fn() } as never,
      createAuthI18n({ t: () => ({}) } as never),
    );
    auth = betterAuth({
      ...options,
      baseURL: BASE_URL,
      database: authDatabase(db),
      rateLimit: { enabled: false },
      secret: 'test-secret-test-secret-test-secret',
    }) as unknown as ReturnType<typeof betterAuth>;

    await request('/sign-up/email', {
      email: 'ann@example.com',
      firstName: 'Ann',
      name: 'Ann',
      password: 'password-1234',
    });
    await client.query(
      `update "user" set email_verified = true, role = 'admin' where email = 'ann@example.com'`,
    );
    const signIn = await request('/sign-in/email', {
      email: 'ann@example.com',
      password: 'password-1234',
    });
    cookie = signIn.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');

    const organization = await request('/organization/create', {
      name: 'Biru',
      slug: 'biru',
      ...ADDRESS,
    });
    expect(organization.status).toBe(200);
    ({ id: organizationId } = (await organization.json()) as { id: string });

    const team = await request('/organization/create-team', {
      name: '外場',
      organizationId,
    });
    expect(team.status).toBe(200);
    ({ id: teamId } = (await team.json()) as { id: string });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it.each([
    [{ name: '  ', slug: 'blank-name' }, 'name'],
    [{ name: 'Blank slug', slug: '  ' }, 'slug'],
  ])('建立門市時擋下 %j', async (fields, field) => {
    const response = await request('/organization/create', {
      ...fields,
      ...ADDRESS,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: `${field} is required`,
    });
  });

  it('更新門市時名稱不能改成空白', async () => {
    const response = await request('/organization/update', {
      organizationId,
      data: { name: ' ' },
    });

    expect(response.status).toBe(400);
  });

  it.each([[''], ['  ']])('建立團隊時名稱 %j 擋下', async (name) => {
    const response = await request('/organization/create-team', {
      name,
      organizationId,
    });

    expect(response.status).toBe(400);
  });

  it('更新團隊時名稱不能改成空白', async () => {
    const response = await request('/organization/update-team', {
      teamId,
      data: { name: ' ', organizationId },
    });

    expect(response.status).toBe(400);
  });

  it.each([
    [
      `update organization set name = ' ' where id = $1`,
      'organization_name_slug_not_blank',
    ],
    [
      `update team set name = '' where organization_id = $1`,
      'team_name_not_blank',
    ],
  ])('資料庫也會擋下空白名稱', async (statement, constraint) => {
    await expect(client.query(statement, [organizationId])).rejects.toThrow(
      constraint,
    );
  });
});
