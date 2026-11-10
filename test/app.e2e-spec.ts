import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import type { PGlite } from '@electric-sql/pglite';
import cookieParser from 'cookie-parser';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { db } from '../src/db/index.js';

vi.hoisted(() => {
  Object.assign(process.env, {
    BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret',
    BETTER_AUTH_URL: 'http://localhost:3001',
    DATABASE_URL: 'postgres://e2e.invalid:5432/e2e',
    ECPAY_BASE_HASH_IV: 'e2e',
    ECPAY_BASE_HASH_KEY: 'e2e',
    ECPAY_BASE_MERCHANT_ID: 'e2e',
    ECPAY_BASE_RETURN_URL: 'http://localhost:3001',
    ECPAY_INVOICE_HASH_IV: 'e2e',
    ECPAY_INVOICE_HASH_KEY: 'e2e',
    ECPAY_INVOICE_MERCHANT_ID: 'e2e',
    ECPAY_OPERATION_MODE: 'Test',
    FALLBACK_LANGUAGE: 'zh-TW',
    NEXT_ADMIN_URL: 'http://localhost:3002',
    NEXT_URL: 'http://localhost:3000',
  });
});

vi.mock('../src/db/index.js', async () => {
  const { drizzle } = await import('drizzle-orm/pglite');
  const { createPGlite } = await import('./pglite.js');
  const schema = await import('../src/db/schema/index.js');

  return { db: drizzle(createPGlite(), { schema }) };
});

describe('App (e2e)', () => {
  const pglite = db as unknown as PgliteDatabase & { $client: PGlite };
  let app: INestApplication<App>;

  beforeAll(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('e2e must not call out')),
    );
    await migrate(pglite, { migrationsFolder: './drizzle' });

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await pglite.$client.close();
    vi.unstubAllGlobals();
  });

  it('匿名可讀取上架中的橫幅', () =>
    request(app.getHttpServer()).get('/api/banners/active').expect(200, []));

  it('未登入不能讀取使用者清單', () =>
    request(app.getHttpServer()).get('/api/users/list').expect(401));

  it.each([
    ['get', '/api/users'],
    ['get', '/api/users/user-1'],
    ['patch', '/api/users/user-1'],
    ['delete', '/api/users/user-1'],
  ] as const)('已移除的 %s %s 回 404', (method, path) =>
    request(app.getHttpServer())[method](path).expect(404),
  );

  it('已移除的 /api/hello 回 404', () =>
    request(app.getHttpServer()).get('/api/hello').expect(404));

  describe('共享點餐單', () => {
    beforeAll(() =>
      pglite.$client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('shared-cart-org', 'Biru', 'shared-cart-store', now(), 'TW', '桃園市', '大園區', '中正東路一段'), ('shared-cart-org-b', 'Biru B', 'shared-cart-store-b', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      ),
    );

    const base = '/api/organizations/shared-cart-store/shared-carts';
    const baseB = '/api/organizations/shared-cart-store-b/shared-carts';
    const setCookies = (response: request.Response) =>
      ([] as string[]).concat(response.headers['set-cookie'] ?? []);
    const participantSetCookie = (response: request.Response) =>
      setCookies(response).find((cookie) =>
        cookie.startsWith('biru_shared_cart_participant_'),
      );
    const participantCookie = (response: request.Response) =>
      participantSetCookie(response)?.split(';')[0];

    it('自取不需 QR code 即可發起，另一支手機以單號加入，離開後單號失效', async () => {
      const server = app.getHttpServer();
      const created = await request(server)
        .post(base)
        .set('content-type', 'application/json')
        .send({ avatar: 'cat', mode: 'pickup', nickname: '小明' })
        .expect(201);
      const host = participantCookie(created)!;
      expect(host).toBeDefined();
      expect(participantSetCookie(created)).not.toMatch(/expires|max-age/i);
      expect(created.body).toMatchObject({
        code: expect.stringMatching(/^\d{6}$/),
        participants: [{ avatar: 'cat', isMe: true, nickname: '小明' }],
      });

      const joined = await request(server)
        .post(`${base}/join`)
        .set('content-type', 'application/json')
        .send({ code: created.body.code })
        .expect(200);
      const guest = participantCookie(joined)!;
      expect(joined.body).toMatchObject({
        items: [],
        me: { status: 'pending' },
        participants: [],
        requests: [],
      });

      const pending = await request(server)
        .get(`${base}/current`)
        .set('cookie', host)
        .expect(200);
      expect(pending.body.requests).toEqual([
        expect.objectContaining({ id: joined.body.me.id }),
      ]);
      await request(server)
        .post(`${base}/current/requests/${joined.body.me.id}/approve`)
        .set('cookie', guest)
        .expect(403);
      await request(server)
        .post(`${base}/current/requests/${joined.body.me.id}/approve`)
        .set('cookie', host)
        .expect(200);
      await request(server)
        .post(`${base}/current/requests/${joined.body.me.id}/approve`)
        .set('cookie', host)
        .expect(404);

      const approved = await request(server)
        .get(`${base}/current`)
        .set('cookie', guest)
        .expect(200);
      expect(approved.body).toMatchObject({
        me: { status: 'active' },
        participants: [{ isMe: false, nickname: '小明' }, { isMe: true }],
      });

      await request(server)
        .delete(`${base}/current/me`)
        .set('cookie', guest)
        .expect(204);
      const current = await request(server)
        .get(`${base}/current`)
        .set('cookie', host)
        .expect(200);
      expect(current.body.participants).toEqual([
        expect.objectContaining({ isMe: true, nickname: '小明' }),
      ]);

      await request(server)
        .delete(`${base}/current/me`)
        .set('cookie', host)
        .expect(204);
      await request(server)
        .post(`${base}/join`)
        .set('content-type', 'application/json')
        .send({ code: created.body.code })
        .expect(404);
    });

    it('拒絕加入請求後對方看不到單，可再送一次', async () => {
      const server = app.getHttpServer();
      const created = await request(server)
        .post(base)
        .set('content-type', 'application/json')
        .send({ mode: 'pickup' })
        .expect(201);
      const host = participantCookie(created)!;
      const joined = await request(server)
        .post(`${base}/join`)
        .set('content-type', 'application/json')
        .send({ code: created.body.code })
        .expect(200);
      const guest = participantCookie(joined)!;

      const rejected = await request(server)
        .delete(`${base}/current/requests/${joined.body.me.id}`)
        .set('cookie', host)
        .expect(200);
      expect(rejected.body.requests).toEqual([]);
      expect(rejected.body.code).not.toBe(created.body.code);
      await request(server)
        .get(`${base}/current`)
        .set('cookie', guest)
        .expect(404);
      await request(server)
        .post(`${base}/join`)
        .set('content-type', 'application/json')
        .set('cookie', guest)
        .send({ code: created.body.code })
        .expect(404);
      await request(server)
        .post(`${base}/join`)
        .set('content-type', 'application/json')
        .set('cookie', guest)
        .send({ code: rejected.body.code })
        .expect(200)
        .expect(({ body }) => expect(body.me.status).toBe('pending'));
    });

    it('已加入的人送出另一張單的請求後仍留在原單，被允許時才移過去', async () => {
      const server = app.getHttpServer();
      const start = () =>
        request(server)
          .post(base)
          .set('content-type', 'application/json')
          .send({ mode: 'pickup' })
          .expect(201);
      const first = await start();
      const second = await start();
      const firstCookie = participantCookie(first)!;
      const secondCookie = participantCookie(second)!;

      const asked = await request(server)
        .post(`${base}/join`)
        .set('content-type', 'application/json')
        .set('cookie', firstCookie)
        .send({ code: second.body.code })
        .expect(200);
      expect(asked.body).toMatchObject({
        code: first.body.code,
        me: { status: 'active' },
        outgoingRequest: { expiresAt: expect.any(String) },
      });

      const waiting = await request(server)
        .get(`${base}/current`)
        .set('cookie', secondCookie)
        .expect(200);
      await request(server)
        .post(`${base}/current/requests/${waiting.body.requests[0].id}/approve`)
        .set('cookie', secondCookie)
        .expect(200);

      const moved = await request(server)
        .get(`${base}/current`)
        .set('cookie', firstCookie)
        .expect(200);
      expect(moved.body).toMatchObject({
        code: second.body.code,
        outgoingRequest: null,
        participants: [{ isMe: false }, { isMe: true }],
      });
    });

    it('另一家門市的共享單不會蓋掉這家的參與者 cookie', async () => {
      const server = app.getHttpServer();
      const inA = await request(server)
        .post(base)
        .set('content-type', 'application/json')
        .send({ mode: 'pickup' })
        .expect(201);
      const cookieA = participantCookie(inA)!;

      const inB = await request(server)
        .post(baseB)
        .set('content-type', 'application/json')
        .set('cookie', cookieA)
        .send({ mode: 'pickup' })
        .expect(201);
      const cookieB = participantCookie(inB)!;
      expect(cookieB.split('=')[0]).not.toBe(cookieA.split('=')[0]);
      await request(server)
        .delete(`${baseB}/current/me`)
        .set('cookie', [cookieA, cookieB].join('; '))
        .expect(204)
        .expect((response) =>
          expect(
            setCookies(response).some((cookie) =>
              cookie.startsWith(`${cookieA.split('=')[0]}=`),
            ),
          ).toBe(false),
        );

      const current = await request(server)
        .get(`${base}/current`)
        .set('cookie', cookieA)
        .expect(200);
      expect(current.body.code).toBe(inA.body.code);
    });

    it('單已失效時清掉這家的 cookie，門市不存在時不清', async () => {
      const server = app.getHttpServer();
      const created = await request(server)
        .post(base)
        .set('content-type', 'application/json')
        .send({ mode: 'pickup' })
        .expect(201);
      const cookie = participantCookie(created)!;
      const name = cookie.split('=')[0];
      await request(server)
        .delete(`${base}/current/me`)
        .set('cookie', cookie)
        .expect(204);

      const stale = await request(server)
        .get(`${base}/current`)
        .set('cookie', cookie)
        .expect(404);
      expect(stale.body.code).toBe('sharedCartNotFound');
      expect(participantSetCookie(stale)).toMatch(
        new RegExp(`^${name}=;.*Expires=Thu, 01 Jan 1970`),
      );

      const unknownStore = await request(server)
        .get('/api/organizations/no-such-store/shared-carts/current')
        .set('cookie', cookie)
        .expect(404);
      expect(unknownStore.body.code).toBe('organizationNotFound');
      expect(participantSetCookie(unknownStore)).toBeUndefined();
    });

    it('內用沒有桌位 QR session 時拒絕發起', () =>
      request(app.getHttpServer())
        .post(base)
        .set('content-type', 'application/json')
        .send({ mode: 'dineIn' })
        .expect(400));
  });

  describe('better-auth 的限流', () => {
    const signIn = (headers: Record<string, string>) =>
      request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .set(headers)
        .send({ email: 'nobody@example.com', password: 'wrong-password' });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('設定 CLIENT_IP_HEADER 後依該標頭的 IP 分桶，客戶端自帶的內部標頭無效', async () => {
      vi.stubEnv('CLIENT_IP_HEADER', 'CF-Connecting-IP');
      const visitor = { 'cf-connecting-ip': '203.0.113.21' };
      for (let i = 0; i < 3; i++)
        expect((await signIn(visitor)).status).not.toBe(429);
      expect((await signIn(visitor)).status).toBe(429);
      expect(
        (
          await signIn({
            ...visitor,
            'x-biru-client-ip': '203.0.113.99',
          })
        ).status,
      ).toBe(429);
      expect(
        (await signIn({ 'cf-connecting-ip': '203.0.113.22' })).status,
      ).not.toBe(429);
    });

    it('CLIENT_IP_HEADER 與 TRUSTED_PROXIES 都沒設時，只保留登入等敏感路徑的限制', async () => {
      vi.stubEnv('CLIENT_IP_HEADER', '');
      vi.stubEnv('TRUSTED_PROXIES', '');
      for (let i = 0; i < 110; i++)
        expect(
          (await request(app.getHttpServer()).get('/api/auth/get-session'))
            .status,
        ).not.toBe(429);
      for (let i = 0; i < 3; i++)
        expect((await signIn({})).status).not.toBe(429);
      expect((await signIn({})).status).toBe(429);
    });
  });
});
