import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth/minimal';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import type { Transaction } from '../attendance/attendance-audit.js';
import * as schema from '../db/schema/index.js';

import { runInAuthTransaction } from './auth-transaction.js';
import { createAuthI18n } from './i18n.js';
import { authDatabase, createAuth } from './index.js';

const BASE_URL = 'http://localhost:3001';

describe.each(['database', 'cookie'] as const)(
  '註冊時的使用者語系（OAuth state 存在 %s）',
  (storeStateStrategy) => {
    let client: PGlite;
    let db: Transaction;
    let auth: ReturnType<typeof betterAuth>;
    let googleEmail: string;

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
        account: { ...options.account, storeStateStrategy },
        database: authDatabase(db),
        rateLimit: { enabled: false },
        secret: 'test-secret-test-secret-test-secret',
        socialProviders: {
          google: {
            ...options.socialProviders.google,
            clientId: 'client-id',
            clientSecret: 'client-secret',
          },
        },
      }) as unknown as ReturnType<typeof betterAuth>;

      const realFetch = globalThis.fetch;
      vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
        String(input instanceof Request ? input.url : input).startsWith(
          'https://oauth2.googleapis.com/token',
        )
          ? Promise.resolve(
              Response.json({
                access_token: 'access-token',
                expires_in: 3600,
                // getUserInfo 只 decode 不驗簽，走真的 mapProfileToUser
                id_token: [
                  { alg: 'RS256', typ: 'JWT' },
                  {
                    sub: googleEmail,
                    email: googleEmail,
                    email_verified: true,
                    name: 'Ann Lee',
                    given_name: 'Ann',
                    family_name: 'Lee',
                  },
                ]
                  .map((part) =>
                    Buffer.from(JSON.stringify(part)).toString('base64url'),
                  )
                  .concat('signature')
                  .join('.'),
                token_type: 'Bearer',
              }),
            )
          : realFetch(input, init),
      );
    }, 60_000);

    afterAll(async () => {
      vi.restoreAllMocks();
      await client.close();
    });

    const request = (
      path: string,
      acceptLanguage: string,
      init: { body?: unknown; cookie?: string } = {},
    ) =>
      runInAuthTransaction(db, () =>
        auth.handler(
          new Request(`${BASE_URL}/api/auth${path}`, {
            method: init.body ? 'POST' : 'GET',
            headers: {
              'accept-language': acceptLanguage,
              'content-type': 'application/json',
              origin: BASE_URL,
              ...(init.cookie && { cookie: init.cookie }),
            },
            body: init.body ? JSON.stringify(init.body) : undefined,
          }),
        ),
      );

    const langOf = async (email: string) => {
      const { rows } = await client.query<{ lang: string }>(
        'select lang from "user" where email = $1',
        [email],
      );

      return rows[0]?.lang;
    };

    const signUpWithGoogle = async (
      pageLanguage: string,
      browserLanguage: string,
    ) => {
      const signIn = await request('/sign-in/social', pageLanguage, {
        body: { provider: 'google', callbackURL: `${BASE_URL}/` },
      });
      const { url } = (await signIn.json()) as { url: string };
      const state = new URL(url).searchParams.get('state')!;
      const cookie = signIn.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');

      const callback = await request(
        `/callback/google?code=code&state=${state}`,
        browserLanguage,
        { cookie },
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get('location')).toBe(`${BASE_URL}/`);
    };

    it('Google 註冊用按下按鈕時的頁面語系，而不是轉址回來時的瀏覽器語系', async () => {
      googleEmail = 'ann@example.com';
      await signUpWithGoogle('ja', 'en-US,en;q=0.9');

      expect(await langOf('ann@example.com')).toBe('ja');
    });

    it('頁面語系是 zh-SG 這類變體時也會對應到支援的語系', async () => {
      googleEmail = 'kit@example.com';
      await signUpWithGoogle('zh-SG', 'en-US,en;q=0.9');

      expect(await langOf('kit@example.com')).toBe('zh-CN');
    });

    it('頁面語系不支援時改用轉址回來時的瀏覽器語系', async () => {
      googleEmail = 'eve@example.com';
      await signUpWithGoogle('fr', 'ko-KR,ko;q=0.9');

      expect(await langOf('eve@example.com')).toBe('ko');
    });

    it('已註冊的使用者用 Google 登入時不改動語系', async () => {
      googleEmail = 'joe@example.com';
      await signUpWithGoogle('ja', 'ja');
      await signUpWithGoogle('ko', 'ko');

      expect(await langOf('joe@example.com')).toBe('ja');
    });

    it('Email 註冊沿用前台送的 lang', async () => {
      const response = await request('/sign-up/email', 'ja', {
        body: {
          email: 'bo@example.com',
          firstName: 'Bo',
          lang: 'ko',
          name: 'Bo',
          password: 'password-1234',
        },
      });
      expect(response.status).toBe(200);

      expect(await langOf('bo@example.com')).toBe('ko');
    });
  },
);
