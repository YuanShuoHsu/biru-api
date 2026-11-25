import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth/minimal';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readFileSync } from 'node:fs';

import { createPGlite } from '../../test/pglite.js';
import type { Transaction } from '../attendance/attendance-audit.js';
import { encryptField } from '../common/utils/field-encryption.js';
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
  let rateLimitedAuth: ReturnType<typeof betterAuth>;
  const cookies: Record<string, string> = {};

  const request = (
    path: string,
    body: unknown,
    cookie?: string,
    instance = auth,
  ) =>
    runWithAuthHookState(() =>
      runInAuthTransaction(db, () =>
        instance.handler(
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
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-test-secret-test-secret');
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', '');
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
    const testOptions = {
      ...options,
      baseURL: BASE_URL,
      database: authDatabase(db),
      secret: 'test-secret-test-secret-test-secret',
    };
    auth = betterAuth({
      ...testOptions,
      rateLimit: { enabled: false },
    }) as unknown as ReturnType<typeof betterAuth>;
    rateLimitedAuth = betterAuth(testOptions) as unknown as ReturnType<
      typeof betterAuth
    >;

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
    await client.query(
      `insert into account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, updated_at)
       values ('ann-google', 'google-sub', 'google', $1, 'google-access-token', 'google-refresh-token', 'google-id-token', now())`,
      [ann],
    );
    await client.query(
      `insert into coupon (id, code, discount_type, discount_value) values ('bo-coupon', 'BO-ONLY', 'fixed', 10)`,
    );
    await client.query(
      `insert into user_coupon (id, coupon_id, source, user_id) values ('bo-user-coupon', 'bo-coupon', 'granted', $1)`,
      [bo],
    );
    await client.query(
      `insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, user_id)
       values ('bo-ticket', 'biru', '2026-11-25', 'A', 1, 2, 'zh-TW', $1)`,
      [bo],
    );
    await client.query(
      `insert into push_subscription (id, endpoint, p256dh, auth, lang, app, user_id) values
         ('ann-push', 'https://push.example.com/ann-endpoint', 'ann-p256dh', 'ann-push-auth', 'zh-TW', 'storefront', $1),
         ('bo-push', 'https://push.example.com/bo-endpoint', 'bo-p256dh', 'bo-push-auth', 'zh-TW', 'storefront', $2)`,
      [ann, bo],
    );
    await client.query(
      `insert into shared_cart (id, organization_id, code, mode) values ('cart', 'biru', 'CART', 'dineIn')`,
    );
    await client.query(
      `insert into shared_cart_participant (id, shared_cart_id, device_key, user_id, session_id, avatar, nickname, member_profile, status) values
         ('ann-participant', 'cart', 'ann-device-key', $1, (select id from session where user_id = $1 limit 1), 'cat', 'Ann', true, 'active'),
         ('bo-participant', 'cart', 'bo-device-key', $2, null, 'dog', 'Bo', true, 'active')`,
      [ann, bo],
    );
    await client.query(
      `insert into attendance_employee (id, organization_id, user_id, hired_at) values
         ('ann-employee', 'biru', $1, '2026-01-01T00:00:00Z'),
         ('bo-employee', 'biru', $2, '2026-01-01T00:00:00Z')`,
      [ann, bo],
    );
    await client.query(
      `insert into attendance_shift (id, organization_id, employee_id, starts_at, ends_at) values
         ('ann-shift', 'biru', 'ann-employee', '2026-11-01T01:00:00Z', '2026-11-01T05:00:00Z'),
         ('bo-shift', 'biru', 'bo-employee', '2026-11-01T01:00:00Z', '2026-11-01T05:00:00Z')`,
    );
    await client.query(
      `insert into attendance_event (id, organization_id, employee_id, shift_id, action, occurred_at, latitude, longitude, accuracy, source_ip, idempotency_key)
       values ('bo-event', 'biru', 'bo-employee', 'bo-shift', 'clockIn', '2026-11-01T01:00:00Z', 25, 121, 10, '203.0.113.9', 'bo-event-key')`,
    );
    await client.query(
      `insert into attendance_request (id, organization_id, employee_id, kind, starts_at, ends_at, reason)
       values ('bo-request', 'biru', 'bo-employee', 'overtime', '2026-11-01T05:00:00Z', '2026-11-01T06:00:00Z', 'bo-reason')`,
    );
    await client.query(
      `insert into attendance_leave_type (id, organization_id, name, paid_percent, requires_balance)
       values ('custom-leave', 'biru', 'Custom', 100, false)`,
    );
    await client.query(
      `insert into attendance_leave_case (id, organization_id, employee_id, leave_type_id, event_date, starts_at, ends_at, granted_minutes, paid_percent, reason, created_by)
       values ('bo-leave-case', 'biru', 'bo-employee', 'custom-leave', '2026-11-02T00:00:00Z', '2026-11-02T01:00:00Z', '2026-11-02T05:00:00Z', 240, 100, 'bo-reason', $1)`,
      [ann],
    );
    await client.query(
      `insert into payroll_statement (id, organization_id, employee_id, employee_name, month, idempotency_key, status, snapshot, reason, created_by, paid_on) values
         ('ann-published-payslip', 'biru', 'ann-employee', 'Ann', '2026-09', 'ann-published-key', 'published', '{}', 'publish', $1, '2026-10-05'),
         ('ann-draft-payslip', 'biru', 'ann-employee', 'Ann', '2026-10', 'ann-draft-key', 'draft', '{}', 'draft', $1, null),
         ('bo-draft-payslip', 'biru', 'bo-employee', 'Bo', '2026-10', 'bo-draft-key', 'draft', '{}', 'draft', $1, null)`,
      [ann],
    );
    await client.query(
      `insert into payroll_tax_identity (employee_id, organization_id, encrypted_tax_id, encrypted_address, residence_country_code, encrypted_foreign_tax_id) values
         ('ann-employee', 'biru', $1, $2, 'JP', $3),
         ('bo-employee', 'biru', $4, $5, null, null)`,
      [
        encryptField('A800000014'),
        encryptField('桃園市大園區中正東路一段 1 號'),
        encryptField('NOTIN'),
        encryptField('B223456789'),
        encryptField('台北市中正區 2 號'),
      ],
    );
    await client.query(
      `insert into session (id, token, user_id, expires_at, updated_at, user_agent, impersonated_by)
       values ('ann-impersonated', 'ann-impersonated-token', $1, now() + interval '1 hour', now(), 'impersonation-agent', $2)`,
      [ann, bo],
    );
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
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

  it('密碼正確時只回本人的資料，不含 token、密碼雜湊、金鑰與內部欄位', async () => {
    const response = await exportData('ann', { password: PASSWORD });
    expect(response.status).toBe(200);
    const text = await response.text();
    const data = JSON.parse(text) as Record<string, unknown>;

    expect(data).toMatchObject({
      profile: { email: 'ann@example.com', firstName: 'ann' },
      orders: [
        {
          id: 'ann-order',
          items: [{ id: 'ann-item', menuItemName: 'Latte' }],
          invoices: [{ carrierType: 'mobile', carrierNum: '/ABC1234' }],
        },
      ],
      pointTransactions: [],
      coupons: [],
      waitlistTickets: [],
      pushSubscriptions: [{ id: 'ann-push' }],
      sharedCarts: [{ id: 'ann-participant', nickname: 'Ann' }],
      employment: {
        employees: [{ id: 'ann-employee' }],
        shifts: [{ id: 'ann-shift' }],
        events: [],
        requests: [],
        leaveCases: [],
        payslips: [{ id: 'ann-published-payslip' }],
        taxIdentities: [
          {
            employeeId: 'ann-employee',
            taxId: 'A800000014',
            address: '桃園市大園區中正東路一段 1 號',
            residenceCountryCode: 'JP',
            foreignTaxId: 'NOTIN',
          },
        ],
      },
    });
    expect(data.accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'credential' }),
        expect.objectContaining({ providerId: 'google' }),
      ]),
    );
    expect(data.profile).not.toHaveProperty('role');
    expect(data.orders).toEqual([
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    ]);
    expect(data.sessions).toEqual([
      expect.not.objectContaining({ token: expect.anything() }),
    ]);

    const { rows: secrets } = await client.query<{ secret: string }>(
      `select token as secret from session
       union all select password from account where password is not null
       union all select unnest(array[access_token, refresh_token, id_token]) from account where provider_id = 'google'
       union all select unnest(array[endpoint, p256dh, auth]) from push_subscription
       union all select device_key from shared_cart_participant
       union all select session_id from shared_cart_participant where session_id is not null`,
    );
    expect(secrets.length).toBeGreaterThan(10);
    for (const { secret } of secrets) expect(text).not.toContain(secret);
    expect(text).not.toContain('bo@example.com');
    expect(text).not.toContain('bo-');
    expect(text).not.toContain('ann-draft-payslip');
    expect(text).not.toContain('B223456789');
    expect(text).not.toContain('impersonation-agent');
  });

  it('模擬登入的 session 不能下載', async () => {
    await client.query(
      `update session set impersonated_by = (select id from "user" where email = 'bo@example.com')
       where user_id = (select id from "user" where email = 'cy@example.com')`,
    );

    const response = await exportData('cy');

    await client.query(
      `update session set impersonated_by = null
       where user_id = (select id from "user" where email = 'cy@example.com')`,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'IMPERSONATED_SESSION_CANNOT_EXPORT_USER_DATA',
      message: '模擬登入時無法下載該會員的資料，請由本人登入後下載',
    });
  });

  it('每 60 秒最多 3 次，第 4 次回 429', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++)
      statuses.push(
        (
          await request(
            '/export-user-data',
            { password: 'wrong-password' },
            cookies.ann,
            rateLimitedAuth,
          )
        ).status,
      );

    expect(statuses).toEqual([400, 400, 400, 429]);
  });

  it('沒登入就擋下', async () => {
    const response = await request('/export-user-data', {});

    expect(response.status).toBe(401);
  });
});
