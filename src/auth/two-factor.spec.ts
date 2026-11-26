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
const PASSWORD = 'password-1234';

describe('two-factor plugin', () => {
  let client: PGlite;
  let db: Transaction;
  let auth: ReturnType<typeof betterAuth>;
  let rateLimitedAuth: ReturnType<typeof betterAuth>;
  const sendTwoFactorOtp = vi.fn();

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
              'content-type': 'application/json',
              origin: BASE_URL,
              ...(cookie && { cookie }),
            },
            body: JSON.stringify(body),
          }),
        ),
      ),
    );

  const cookieOf = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');

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

    return cookieOf(
      await request('/sign-in/email', { email, password: PASSWORD }),
    );
  };

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as Transaction;

    const { options } = createAuth(
      { sendVerificationEmail: vi.fn(), sendTwoFactorOtp } as never,
      { issueSignupCoupons: vi.fn() } as never,
      createAuthI18n({ t: () => ({}) } as never),
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
  });

  afterAll(async () => {
    await client.close();
  });

  it('驗證器 App 顯示 Biru Coffee，設定金鑰與備用碼存進 two_factor', async () => {
    const cookie = await signUpAndIn('ann');

    const response = await request(
      '/two-factor/enable',
      { password: PASSWORD },
      cookie,
    );

    expect(response.status).toBe(200);
    const { totpURI, backupCodes } = (await response.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    expect(new URL(totpURI).searchParams.get('issuer')).toBe('Biru Coffee');
    expect(backupCodes).toHaveLength(10);
    const { rows } = await client.query<{ verified: boolean }>(
      `select verified from two_factor
       where user_id = (select id from "user" where email = 'ann@example.com')`,
    );
    expect(rows).toEqual([{ verified: false }]);
  });

  describe('Email 驗證碼', () => {
    let twoFactorCookie: string;

    beforeAll(async () => {
      const cookie = await signUpAndIn('bo');
      expect(
        (
          await request(
            '/two-factor/enable',
            { password: PASSWORD, method: 'otp' },
            cookie,
          )
        ).status,
      ).toBe(200);
      await client.query(
        `update "user" set lang = 'ja' where email = 'bo@example.com'`,
      );

      const signIn = await request('/sign-in/email', {
        email: 'bo@example.com',
        password: PASSWORD,
      });
      expect(await signIn.json()).toMatchObject({ twoFactorRedirect: true });
      twoFactorCookie = cookieOf(signIn);
    });

    it('寄信交給 sendTwoFactorOtp，收件人帶著自己的語系', async () => {
      sendTwoFactorOtp.mockClear();

      const response = await request(
        '/two-factor/send-otp',
        {},
        twoFactorCookie,
      );

      expect(response.status).toBe(200);
      expect(sendTwoFactorOtp).toHaveBeenCalledExactlyOnceWith(
        {
          user: expect.objectContaining({
            email: 'bo@example.com',
            lang: 'ja',
          }),
          otp: expect.stringMatching(/^\d{6}$/),
        },
        expect.any(Request),
      );
    });

    it('同一瀏覽器再用密碼登入、停在兩步驟驗證時，不換掉已登入的 session', async () => {
      const signIn = await request('/sign-in/email', {
        email: 'bo@example.com',
        password: PASSWORD,
      });
      const challenge = cookieOf(signIn);
      sendTwoFactorOtp.mockClear();
      await request('/two-factor/send-otp', {}, challenge);
      const [[{ otp }]] = sendTwoFactorOtp.mock.calls as [[{ otp: string }]];
      const verified = await request(
        '/two-factor/verify-otp',
        { code: otp },
        challenge,
      );
      expect(verified.status).toBe(200);
      const { token } = (await verified.json()) as { token: string };
      const signedIn = verified.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .filter((value) => !value.endsWith('='))
        .join('; ');
      expect(signedIn).toContain('_multi-');

      const again = await request(
        '/sign-in/email',
        { email: 'bo@example.com', password: PASSWORD },
        signedIn,
      );

      expect(await again.json()).toMatchObject({ twoFactorRedirect: true });
      expect(
        again.headers
          .getSetCookie()
          .filter((value) => value.includes('_multi-')),
      ).toEqual([]);
      const { rows } = await client.query(
        `select 1 from session where token = $1`,
        [token],
      );
      expect(rows).toHaveLength(1);
    });

    it('每 60 秒最多寄 3 次，第 4 次起回 429', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const send = async () =>
          (
            await request(
              '/two-factor/send-otp',
              {},
              twoFactorCookie,
              rateLimitedAuth,
            )
          ).status;

        const statuses = [
          await send(),
          await send(),
          await send(),
          await send(),
        ];
        vi.setSystemTime(Date.now() + 11_000);
        statuses.push(await send());

        expect(statuses).toEqual([200, 200, 200, 429, 429]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
