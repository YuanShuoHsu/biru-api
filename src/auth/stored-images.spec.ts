import { PGlite } from '@electric-sql/pglite';
import { S3Client } from '@aws-sdk/client-s3';
import { betterAuth } from 'better-auth/minimal';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import type { Transaction } from '../attendance/attendance-audit.js';
import * as schema from '../db/schema/index.js';
import { ImageStorageService } from '../images/image-storage.service.js';
import { imageVersion } from '../images/image-url.js';

import { runInAuthTransaction } from './auth-transaction.js';
import { runWithAuthHookState } from './hooks.js';
import { createAuthI18n } from './i18n.js';
import { authDatabase, createAuth } from './index.js';

const BASE_URL = 'http://localhost:3001';

const S3_ENV: Record<string, string> = {
  S3_ENDPOINT: 'https://project.storage.supabase.co/storage/v1/s3',
  S3_REGION: 'ap-northeast-1',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_BUCKET: 'biru-images',
  S3_PUBLIC_URL: 'https://images.example.com',
};

const ADDRESS = {
  addressCountry: 'TW',
  addressLocality: '大園區',
  addressRegion: '桃園市',
  streetAddress: '中正東路 1 號',
};

const IMAGE = 'data:image/png;base64,iVBORw0KGgo=';
const OTHER_IMAGE = 'data:image/webp;base64,UklGRg==';
const HTTPS_IMAGE = 'https://lh3.googleusercontent.com/a/avatar';
const INVALID_IMAGES = [
  [
    'svg',
    `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}`,
  ],
  ['過長', `data:image/png;base64,${'A'.repeat(600_000)}`],
  ['非 base64', 'data:image/png;base64,<script>alert(1)</script>'],
  ['text/html', 'data:text/html,<script>alert(1)</script>'],
  ['大寫 MIME', 'data:IMAGE/PNG;base64,iVBORw0KGgo='],
];

const storedUrl = (kind: string, image: string, extension: string) =>
  `https://images.example.com/${kind}/${imageVersion(image)}.${extension}`;

describe.each([
  ['設定 S3 時', S3_ENV],
  ['沒設 S3 時', {}],
])('%s，會員頭像與門市 logo 寫入前上傳', (_label, env) => {
  const s3 = Object.keys(env).length > 0;
  let client: PGlite;
  let db: Transaction;
  let auth: ReturnType<typeof betterAuth>;
  let cookie = '';
  let organizationId: string;
  let slugIndex = 0;
  let emailIndex = 0;
  let send: ReturnType<typeof vi.spyOn>;

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

  const userImage = async (email: string) => {
    const { rows } = await client.query<{ image: string | null }>(
      'select image from "user" where email = $1',
      [email],
    );

    return rows[0].image;
  };

  const organizationLogo = async (id: string) => {
    const { rows } = await client.query<{ logo: string | null }>(
      'select logo from organization where id = $1',
      [id],
    );

    return rows[0].logo;
  };

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as Transaction;

    const { options } = createAuth(
      { sendVerificationEmail: vi.fn() } as never,
      { issueSignupCoupons: vi.fn() } as never,
      createAuthI18n({ t: () => ({}) } as never),
      new ImageStorageService({ get: (key: string) => env[key] } as never),
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
    await request('/sign-up/email', {
      email: 'bo@example.com',
      firstName: 'Bo',
      name: 'Bo',
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

  beforeEach(() => {
    send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await client.close();
  });

  it('更新會員頭像的 data URL', async () => {
    const response = await request('/update-user', { image: IMAGE });

    expect(response.status).toBe(200);
    expect(await userImage('ann@example.com')).toBe(
      s3 ? storedUrl('user', IMAGE, 'png') : IMAGE,
    );
    expect(send).toHaveBeenCalledTimes(s3 ? 1 : 0);
  });

  it('沒帶頭像時不動原本的頭像', async () => {
    const before = await userImage('ann@example.com');

    const response = await request('/update-user', { bio: 'hi' });

    expect(response.status).toBe(200);
    expect(await userImage('ann@example.com')).toBe(before);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([[HTTPS_IMAGE], [null]])('頭像 %j 原樣寫入', async (image) => {
    const response = await request('/update-user', { image });

    expect(response.status).toBe(200);
    expect(await userImage('ann@example.com')).toBe(image);
    expect(send).not.toHaveBeenCalled();
  });

  it('平台管理員更新其他會員的頭像', async () => {
    const { rows } = await client.query<{ id: string }>(
      `select id from "user" where email = 'bo@example.com'`,
    );

    const response = await request('/admin/update-user', {
      userId: rows[0].id,
      data: { image: OTHER_IMAGE },
    });

    expect(response.status).toBe(200);
    expect(await userImage('bo@example.com')).toBe(
      s3 ? storedUrl('user', OTHER_IMAGE, 'webp') : OTHER_IMAGE,
    );
  });

  it('註冊時帶的頭像', async () => {
    const response = await request('/sign-up/email', {
      email: 'cy@example.com',
      firstName: 'Cy',
      name: 'Cy',
      password: 'password-1234',
      image: IMAGE,
    });

    expect(response.status).toBe(200);
    expect(await userImage('cy@example.com')).toBe(
      s3 ? storedUrl('user', IMAGE, 'png') : IMAGE,
    );
  });

  it('建立門市時帶的 logo', async () => {
    const response = await request('/organization/create', {
      name: 'Logo',
      slug: `logo-${slugIndex++}`,
      ...ADDRESS,
      logo: IMAGE,
    });

    expect(response.status).toBe(200);
    const { id, logo } = (await response.json()) as {
      id: string;
      logo: string;
    };
    const expected = s3 ? storedUrl('organization', IMAGE, 'png') : IMAGE;
    expect(logo).toBe(expected);
    expect(await organizationLogo(id)).toBe(expected);
  });

  it('更新門市 logo 的 data URL', async () => {
    const response = await request('/organization/update', {
      organizationId,
      data: { logo: OTHER_IMAGE },
    });

    expect(response.status).toBe(200);
    expect(await organizationLogo(organizationId)).toBe(
      s3 ? storedUrl('organization', OTHER_IMAGE, 'webp') : OTHER_IMAGE,
    );
    expect(send).toHaveBeenCalledTimes(s3 ? 1 : 0);
  });

  it('沒帶 logo 時不動原本的 logo', async () => {
    const before = await organizationLogo(organizationId);

    const response = await request('/organization/update', {
      organizationId,
      data: { name: 'Biru Coffee' },
    });

    expect(response.status).toBe(200);
    expect(await organizationLogo(organizationId)).toBe(before);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([[HTTPS_IMAGE], [null]])('logo %j 原樣寫入', async (logo) => {
    const response = await request('/organization/update', {
      organizationId,
      data: { logo },
    });

    expect(response.status).toBe(200);
    expect(await organizationLogo(organizationId)).toBe(logo);
    expect(send).not.toHaveBeenCalled();
  });

  const expectRejected = async (response: Response, field: string) => {
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: `${field} must be a png, jpeg or webp data URL of at most 600000 characters`,
    });
    expect(send).not.toHaveBeenCalled();
  };

  describe.each(INVALID_IMAGES)('%s 的 data URL', (_kind, image) => {
    it('註冊時拒絕且不建立會員', async () => {
      const email = `invalid-${emailIndex++}@example.com`;

      const response = await request('/sign-up/email', {
        email,
        firstName: 'Dee',
        name: 'Dee',
        password: 'password-1234',
        image,
      });

      await expectRejected(response, 'image');
      const { rows } = await client.query(
        'select id from "user" where email = $1',
        [email],
      );
      expect(rows).toHaveLength(0);
    });

    it('更新頭像時拒絕且不動原本的頭像', async () => {
      const before = await userImage('ann@example.com');

      const response = await request('/update-user', { image });

      await expectRejected(response, 'image');
      expect(await userImage('ann@example.com')).toBe(before);
    });

    it('建立門市時拒絕且不建立門市', async () => {
      const slug = `invalid-${slugIndex++}`;

      const response = await request('/organization/create', {
        name: 'Invalid',
        slug,
        ...ADDRESS,
        logo: image,
      });

      await expectRejected(response, 'logo');
      const { rows } = await client.query(
        'select id from organization where slug = $1',
        [slug],
      );
      expect(rows).toHaveLength(0);
    });

    it('更新門市 logo 時拒絕且不動原本的 logo', async () => {
      const before = await organizationLogo(organizationId);

      const response = await request('/organization/update', {
        organizationId,
        data: { logo: image },
      });

      await expectRejected(response, 'logo');
      expect(await organizationLogo(organizationId)).toBe(before);
    });
  });

  it.runIf(s3)('註冊時上傳失敗不建立會員', async () => {
    send.mockRejectedValue(new Error('storage unavailable'));

    const response = await request('/sign-up/email', {
      email: 'fail@example.com',
      firstName: 'Fay',
      name: 'Fay',
      password: 'password-1234',
      image: IMAGE,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: 'FAILED_TO_CREATE_USER',
    });
    const { rows } = await client.query(
      `select id from "user" where email = 'fail@example.com'`,
    );
    expect(rows).toHaveLength(0);
  });
});
