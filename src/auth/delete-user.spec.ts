import type { PGlite } from '@electric-sql/pglite';
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
const PASSWORD = 'password-1234';

describe('delete user', () => {
  let client: PGlite;
  let db: Transaction;
  let auth: ReturnType<typeof betterAuth>;
  const sendDeleteAccountVerification = vi.fn();

  const request = (path: string, body: unknown, cookie?: string) =>
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
      {
        sendVerificationEmail: vi.fn(),
        sendDeleteAccountVerification,
      } as never,
      { issueSignupCoupons: vi.fn() } as never,
      createAuthI18n({ t: () => ({}) } as never),
      {} as never,
    );
    auth = betterAuth({
      ...options,
      baseURL: BASE_URL,
      database: authDatabase(db),
      rateLimit: { enabled: false },
      secret: 'test-secret-test-secret-test-secret',
    }) as unknown as ReturnType<typeof betterAuth>;
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('刪除帳號的確認連結 1 小時後失效，和信上寫的期限一致', async () => {
    const email = 'ann@example.com';
    await request('/sign-up/email', {
      email,
      firstName: 'Ann',
      name: 'Ann',
      password: PASSWORD,
    });
    await client.query(
      `update "user" set email_verified = true where email = $1`,
      [email],
    );
    const cookie = (
      await request('/sign-in/email', { email, password: PASSWORD })
    ).headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');

    const response = await request('/delete-user', {}, cookie);

    expect(response.status).toBe(200);
    expect(sendDeleteAccountVerification).toHaveBeenCalledOnce();
    const { rows } = await client.query<{ seconds: number }>(
      `select extract(epoch from expires_at - created_at)::int as seconds
       from verification where identifier like 'delete-account-%'`,
    );
    expect(rows).toEqual([{ seconds: 60 * 60 }]);
  });
});
