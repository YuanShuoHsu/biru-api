import { readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth/minimal';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import type { Transaction } from '../attendance/attendance-audit.js';
import { DINE_IN_MAX_TABLE_COUNT } from '../common/constants/dine-in.js';
import * as schema from '../db/schema/index.js';
import { languagesEnum } from '../db/schema/enums.js';

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

const authTranslations = (lang: string) =>
  JSON.parse(readFileSync(`src/i18n/${lang}/auth.json`, 'utf8')) as Record<
    string,
    string
  >;

describe('門市內用桌數必須是 1 到上限的整數', () => {
  let client: PGlite;
  let db: Transaction;
  let auth: ReturnType<typeof betterAuth>;
  let cookie = '';
  let organizationId: string;
  let slugIndex = 0;

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

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as Transaction;

    const { options } = createAuth(
      { sendVerificationEmail: vi.fn() } as never,
      { issueSignupCoupons: vi.fn() } as never,
      createAuthI18n({
        t: (_key: string, { lang }: { lang: string }) => authTranslations(lang),
      } as never),
      {} as never,
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
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it.each([[0], [DINE_IN_MAX_TABLE_COUNT + 1], [1.5]])(
    '建立與更新門市時擋下 %j，並以請求語系翻譯錯誤訊息',
    async (dineInTableCount) => {
      const created = await request('/organization/create', {
        name: 'Tables',
        slug: `tables-${slugIndex++}`,
        ...ADDRESS,
        dineInTableCount,
      });
      const updated = await request('/organization/update', {
        organizationId,
        data: { dineInTableCount },
      });

      for (const response of [created, updated]) {
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          code: 'INVALID_DINE_IN_TABLE_COUNT',
          message: authTranslations('zh-TW').INVALID_DINE_IN_TABLE_COUNT,
        });
      }
    },
  );

  it.each([[1], [DINE_IN_MAX_TABLE_COUNT], [null]])(
    '更新門市時接受 %j',
    async (dineInTableCount) => {
      const response = await request('/organization/update', {
        organizationId,
        data: { dineInTableCount },
      });

      expect(response.status).toBe(200);
    },
  );

  it.each(languagesEnum.enumValues)('%s 的錯誤訊息寫出目前的上限', (lang) => {
    expect(authTranslations(lang).INVALID_DINE_IN_TABLE_COUNT).toContain(
      String(DINE_IN_MAX_TABLE_COUNT),
    );
  });
});
