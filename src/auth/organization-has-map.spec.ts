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

describe('門市地圖連結只接受 Google 地圖嵌入網址', () => {
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
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['ftp://example.com/map'],
    ['//www.google.com/maps'],
    ['www.google.com/maps'],
    ['https://evil.example.com/maps/embed?pb=1'],
    ['https://www.google.com.evil.example/maps/embed?pb=1'],
    ['http://www.google.com/maps/embed?pb=1'],
    ['https://maps.app.goo.gl/abc'],
    ['https://www.google.com/maps/place/Biru'],
    ['https://www.google.com/maps/embedded'],
    ['https://www.google.com/maps/embed/../../url?q=https://evil.example'],
    ['https://www.google.com/maps/embed/v1/../../url'],
    ['HTTPS://WWW.GOOGLE.COM/maps/embed?pb=!1m18'],
    ['https://www.google.com/MAPS/EMBED?pb=!1m18'],
  ])('建立與更新門市時擋下 %j', async (hasMap) => {
    const created = await request('/organization/create', {
      name: 'Map',
      slug: `map-${slugIndex++}`,
      ...ADDRESS,
      hasMap,
    });
    const updated = await request('/organization/update', {
      organizationId,
      data: { hasMap },
    });

    for (const response of [created, updated]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        message: 'hasMap must be a Google Maps embed URL',
      });
    }
  });

  it('建立門市時接受 Google 地圖嵌入網址', async () => {
    const response = await request('/organization/create', {
      name: 'Map',
      slug: `map-${slugIndex++}`,
      ...ADDRESS,
      hasMap: 'https://www.google.com/maps/embed?pb=!1m18!1m12',
    });

    expect(response.status).toBe(200);
  });

  it.each([
    [
      'https://www.google.com/maps/embed?pb=!1m18!1m12',
      'https://www.google.com/maps/embed?pb=!1m18!1m12',
    ],
    [
      'https://www.google.com/maps/embed/v1/place?key=KEY&q=Biru',
      'https://www.google.com/maps/embed/v1/place?key=KEY&q=Biru',
    ],
    ['https://www.google.com/maps/embed', 'https://www.google.com/maps/embed'],
    ['', ''],
    [null, null],
  ])('更新門市時接受 %j', async (hasMap, stored) => {
    const response = await request('/organization/update', {
      organizationId,
      data: { hasMap },
    });

    expect(response.status).toBe(200);
    const { rows } = await client.query<{ has_map: string | null }>(
      'select has_map from organization where id = $1',
      [organizationId],
    );
    expect(rows[0].has_map).toBe(stored);
  });
});
