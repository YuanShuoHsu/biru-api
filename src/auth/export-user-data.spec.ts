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
const PASSWORD = 'password-1234';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('POST /export-user-data', () => {
  let client: PGlite;
  let db: Transaction;
  let auth: ReturnType<typeof betterAuth>;
  const cookies: Record<string, string> = {};

  const request = (path: string, body: unknown, cookie?: string) =>
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

  const signUpAndIn = async (name: string) => {
    const email = `${name}@example.com`;
    expect(
      (
        await request('/sign-up/email', {
          email,
          firstName: name,
          name,
          password: PASSWORD,
        })
      ).status,
    ).toBe(200);
    await client.query(
      `update "user" set email_verified = true where email = $1`,
      [email],
    );
    const signIn = await request('/sign-in/email', {
      email,
      password: PASSWORD,
    });
    cookies[name] = signIn.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const { rows } = await client.query<{ id: string }>(
      `select id from "user" where email = $1`,
      [email],
    );
    return rows[0].id;
  };

  const exportData = (name: string, body: unknown = {}) =>
    request('/export-user-data', body, cookies[name]);

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

    const ann = await signUpAndIn('ann');
    const bo = await signUpAndIn('bo');
    await signUpAndIn('cy');
    await client.query(
      `delete from account where user_id = (select id from "user" where email = 'cy@example.com')`,
    );

    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address)
       values ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, user_id, idempotency_key) values
         ('ann-order', '{}', 'pickup', 'A001', 'Cash', 'biru', 100, $1, 'ann-key'),
         ('bo-order', '{}', 'pickup', 'B001', 'Cash', 'biru', 200, $2, null)`,
      [ann, bo],
    );
    await client.query(
      `insert into order_item (id, menu_item_id, menu_item_name, order_id, order_quantity, unit_price)
       values ('ann-item', 'latte', 'Latte', 'ann-order', 1, 100)`,
    );
    await client.query(
      `insert into invoice (id, order_id, type, carrier_type, carrier_num)
       values ('ann-invoice', 'ann-order', 'personal', 'mobile', '/ABC1234')`,
    );
    await client.query(
      `insert into point_transaction (id, user_id, points, type) values ('bo-points', $1, 5, 'earn')`,
      [bo],
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('有密碼的帳號沒帶密碼就擋下', async () => {
    const response = await exportData('ann');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_PASSWORD' });
  });

  it('密碼錯誤就擋下並回傳使用者語系的訊息', async () => {
    const response = await exportData('ann', { password: 'wrong-password' });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'INVALID_PASSWORD',
      message: '目前密碼錯誤，請重新輸入',
    });
  });

  it('沒有密碼的帳號，登入超過一天就要求重新登入', async () => {
    await client.query(
      `update session set created_at = $1 where user_id = (select id from "user" where email = 'cy@example.com')`,
      [new Date(Date.now() - 2 * DAY_MS)],
    );

    const response = await exportData('cy');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'SESSION_EXPIRED',
      message: '為了安全，請重新登入後再試',
    });
  });

  it('沒有密碼的帳號，剛登入就能下載', async () => {
    await client.query(
      `update session set created_at = now() where user_id = (select id from "user" where email = 'cy@example.com')`,
    );

    const response = await exportData('cy');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: { email: 'cy@example.com' },
      accounts: [],
    });
  });

  it('密碼正確時只回本人的資料，不含 token、密碼雜湊與內部欄位', async () => {
    const response = await exportData('ann', { password: PASSWORD });
    expect(response.status).toBe(200);
    const text = await response.text();
    const data = JSON.parse(text) as Record<string, unknown>;

    expect(data).toMatchObject({
      profile: { email: 'ann@example.com', firstName: 'ann' },
      accounts: [{ providerId: 'credential' }],
      orders: [
        {
          id: 'ann-order',
          items: [{ id: 'ann-item', menuItemName: 'Latte' }],
          invoices: [{ carrierType: 'mobile', carrierNum: '/ABC1234' }],
        },
      ],
      pointTransactions: [],
      employment: { employees: [], payslips: [] },
    });
    expect(data.profile).not.toHaveProperty('role');
    expect(data.orders).toEqual([
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    ]);
    expect(data.sessions).toEqual([
      expect.not.objectContaining({ token: expect.anything() }),
    ]);

    const { rows: secrets } = await client.query<{ secret: string }>(
      `select token as secret from session
       union all select password from account where password is not null`,
    );
    for (const { secret } of secrets) expect(text).not.toContain(secret);
    expect(text).not.toContain('bo@example.com');
    expect(text).not.toContain('bo-order');
  });

  it('沒登入就擋下', async () => {
    const response = await request('/export-user-data', {});

    expect(response.status).toBe(401);
  });
});
