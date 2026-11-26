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
const UPLOADED = 'data:image/png;base64,iVBORw0KGgo=';
const PICTURE = 'https://lh3.googleusercontent.com/a/linked=s96-c';

describe('連結 Google 換掉頭像時寫下異動紀錄', () => {
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
      { store: (_kind: string, image: string) => image } as never,
    );
    auth = betterAuth({
      ...options,
      baseURL: BASE_URL,
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
              id_token: [
                { alg: 'RS256', typ: 'JWT' },
                {
                  sub: googleEmail,
                  email: googleEmail,
                  email_verified: true,
                  name: 'Ann Lee',
                  given_name: 'Ann',
                  family_name: 'Lee',
                  picture: PICTURE,
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
    init: { body?: unknown; cookie?: string } = {},
  ) =>
    runWithAuthHookState(() =>
      runInAuthTransaction(db, () =>
        auth.handler(
          new Request(`${BASE_URL}/api/auth${path}`, {
            method: init.body ? 'POST' : 'GET',
            headers: {
              'content-type': 'application/json',
              origin: BASE_URL,
              ...(init.cookie && { cookie: init.cookie }),
            },
            body: init.body ? JSON.stringify(init.body) : undefined,
          }),
        ),
      ),
    );

  const cookiesOf = (response: Response, existing = '') =>
    [
      existing,
      ...response.headers.getSetCookie().map((value) => value.split(';')[0]),
    ]
      .filter(Boolean)
      .join('; ');

  const signUp = async (email: string) => {
    await request('/sign-up/email', {
      body: {
        email,
        firstName: 'Ann',
        name: 'Ann',
        password: 'password-1234',
        image: UPLOADED,
      },
    });
    await client.query(
      'update "user" set email_verified = true where email = $1',
      [email],
    );
  };

  const completeOAuth = async (start: Response, cookie: string) => {
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get('state')!;

    const callback = await request(
      `/callback/google?code=code&state=${state}`,
      { cookie: cookiesOf(start, cookie) },
    );
    expect(callback.status).toBe(302);
  };

  const imageAudits = async (email: string) => {
    const { rows } = await client.query<{
      actor_email: string;
      changes: unknown;
    }>(
      `select a.actor_email, a.changes from audit_log a
       join "user" u on u.id = a.resource_id
       where a.resource = 'user' and u.email = $1`,
      [email],
    );

    return rows;
  };

  it('用 Google 登入同 email 的帳號時，記下換下的頭像', async () => {
    googleEmail = 'ann@example.com';
    await signUp(googleEmail);

    const start = await request('/sign-in/social', {
      body: { provider: 'google', callbackURL: `${BASE_URL}/` },
    });
    await completeOAuth(start, '');

    expect(await imageAudits(googleEmail)).toEqual([
      {
        actor_email: googleEmail,
        changes: { image: { before: UPLOADED, after: PICTURE } },
      },
    ]);
  });

  it('登入後在帳號設定連結 Google 時，記下換下的頭像', async () => {
    googleEmail = 'bo@example.com';
    await signUp(googleEmail);
    const signIn = await request('/sign-in/email', {
      body: { email: googleEmail, password: 'password-1234' },
    });
    const cookie = cookiesOf(signIn);

    const start = await request('/link-social', {
      body: { provider: 'google', callbackURL: `${BASE_URL}/` },
      cookie,
    });
    await completeOAuth(start, cookie);

    expect(await imageAudits(googleEmail)).toEqual([
      {
        actor_email: googleEmail,
        changes: { image: { before: UPLOADED, after: PICTURE } },
      },
    ]);
  });
});
