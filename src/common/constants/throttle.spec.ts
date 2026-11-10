import {
  ForbiddenException,
  type CanActivate,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import request from 'supertest';
import type { App } from 'supertest/types.js';

import { CouponsController } from '../../coupons/coupons.controller.js';
import { EcpayController } from '../../ecpay/ecpay.controller.js';
import { GcisController } from '../../gcis/gcis.controller.js';
import { OrdersController } from '../../orders/orders.controller.js';
import { WaitlistController } from '../../waitlist/waitlist.controller.js';

import { throttleTracker, THROTTLERS } from './throttle.js';

class RejectAfterThrottle implements CanActivate {
  canActivate(): boolean {
    throw new ForbiddenException();
  }
}

const ANONYMOUS_ROUTES = [
  ['post', '/organizations/shop/orders'],
  ['post', '/organizations/shop/waitlist/tickets'],
  ['post', '/organizations/shop/coupons/validate'],
  ['get', '/gcis/12345678'],
  ['post', '/ecpay'],
  ['post', '/ecpay/check-barcode'],
] as const;

const getSession = vi.fn(({ headers }: { headers: Headers }) => {
  const id = headers.get('x-test-user');
  return Promise.resolve(id ? { user: { id } } : null);
});
const auth = { api: { getSession } } as unknown as Parameters<
  typeof throttleTracker
>[0];

const UNNAMED_ROUTES = [
  ['post', '/organizations/shop/orders/expected-points'],
  ['get', '/organizations/shop/coupons/available'],
] as const;

describe('THROTTLERS', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: THROTTLERS,
          getTracker: throttleTracker(auth),
        }),
      ],
      controllers: [
        CouponsController,
        EcpayController,
        GcisController,
        OrdersController,
        WaitlistController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: RejectAfterThrottle },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'http://localhost:3000' },
        },
      ],
    })
      .useMocker(() => ({}))
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    getSession.mockClear();
  });

  const send = (
    method: 'get' | 'post',
    path: string,
    headers: Record<string, string> = {},
  ) => request(app.getHttpServer())[method](path).set(headers);

  const expectLimit = async (
    method: 'get' | 'post',
    path: string,
    limit: number,
    headers: Record<string, string> = {},
  ) => {
    for (let i = 0; i < limit; i++)
      await send(method, path, headers).expect(403);
    await send(method, path, headers).expect(429);
  };

  describe('設定 TRUSTED_PROXIES 時', () => {
    beforeEach(() => {
      vi.stubEnv('TRUSTED_PROXIES', 'loopback');
      vi.stubEnv('CLIENT_IP_HEADER', '');
    });

    it.each(ANONYMOUS_ROUTES)('%s %s 每分鐘 30 次', async (method, path) => {
      await expectLimit(method, path, 30);

      vi.advanceTimersByTime(61_000);
      await send(method, path).expect(403);
    });

    it.each(ANONYMOUS_ROUTES)('%s %s 每小時 150 次', async (method, path) => {
      for (let minute = 0; minute < 5; minute++) {
        for (let i = 0; i < 30; i++) await send(method, path).expect(403);
        vi.advanceTimersByTime(61_000);
      }

      await send(method, path).expect(429);
      vi.advanceTimersByTime(61_000);
      await send(method, path).expect(429);

      vi.advanceTimersByTime(60 * 60_000);
      await send(method, path).expect(403);
    });

    it('登入的請求依使用者分桶，不與同 IP 的匿名請求共用', async () => {
      const path = '/gcis/12345678';
      await expectLimit('get', path, 30);

      await expectLimit('get', path, 30, { 'x-test-user': 'u1' });
      await send('get', path, { 'x-test-user': 'u2' }).expect(403);
    });

    it('每個請求只查一次 session', async () => {
      await send('get', '/gcis/12345678', { 'x-test-user': 'u1' }).expect(403);
      expect(getSession).toHaveBeenCalledTimes(1);
    });

    it.each(UNNAMED_ROUTES)(
      '沒有 @Throttle 的 %s %s 維持每分鐘 100 次，也沒有具名 throttler 的標頭',
      async (method, path) => {
        const first = await send(method, path).expect(403);
        expect(first.headers['x-ratelimit-limit']).toBe('100');
        expect(first.headers['x-ratelimit-limit-anonymous']).toBeUndefined();
        expect(first.headers['x-ratelimit-limit-hourly']).toBeUndefined();

        await expectLimit(method, path, 99);

        vi.advanceTimersByTime(61_000);
        await expectLimit(method, path, 100);
      },
    );
  });

  describe('只設 CLIENT_IP_HEADER 時', () => {
    beforeEach(() => {
      vi.stubEnv('TRUSTED_PROXIES', '');
      vi.stubEnv('CLIENT_IP_HEADER', 'CF-Connecting-IP');
    });

    it('依標頭的 IP 分桶', async () => {
      const path = '/gcis/12345678';
      await expectLimit('get', path, 30, { 'cf-connecting-ip': '203.0.113.1' });
      await send('get', path, { 'cf-connecting-ip': '203.0.113.2' }).expect(
        403,
      );
    });

    it('缺標頭或不是單一 IP 的請求共用同一桶', async () => {
      const path = '/gcis/12345678';
      for (let i = 0; i < 15; i++) await send('get', path).expect(403);
      await expectLimit('get', path, 15, {
        'cf-connecting-ip': '203.0.113.1, 203.0.113.2',
      });
      await send('get', path, { 'cf-connecting-ip': '203.0.113.1' }).expect(
        403,
      );
    });
    it('Next 伺服器帶共享密鑰轉送的訪客 IP 各自分桶', async () => {
      vi.stubEnv('CLIENT_IP_FORWARD_SECRET', 'forward-secret');
      const path = '/gcis/12345678';
      const viaNext = (ip: string) => ({
        'cf-connecting-ip': '198.51.100.7',
        'x-forwarded-client-ip': ip,
        'x-client-ip-forward-secret': 'forward-secret',
      });
      await expectLimit('get', path, 30, viaNext('203.0.113.1'));
      await send('get', path, viaNext('203.0.113.2')).expect(403);
      await send('get', path, { 'cf-connecting-ip': '198.51.100.7' }).expect(
        403,
      );
    });
  });

  describe('TRUSTED_PROXIES 與 CLIENT_IP_HEADER 都沒設時', () => {
    beforeEach(() => {
      vi.stubEnv('TRUSTED_PROXIES', '');
      vi.stubEnv('CLIENT_IP_HEADER', '');
    });

    it.each([
      ...ANONYMOUS_ROUTES.map(([method, path]) => [method, path] as const),
      ...UNNAMED_ROUTES,
    ])('%s %s 不限流，也沒有限流標頭', async (method, path) => {
      for (let i = 0; i < 101; i++) {
        const res = await send(method, path).expect(403);
        expect(res.headers['x-ratelimit-limit']).toBeUndefined();
      }
    });
  });
});

describe('throttleTracker', () => {
  const track = (req: Record<string, unknown>) =>
    throttleTracker(auth)(
      { headers: {}, ...req },
      {} as Parameters<ReturnType<typeof throttleTracker>>[1],
    );

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('登入時用使用者 id', async () => {
    await expect(
      track({ headers: { 'x-test-user': 'u1' }, ip: '10.0.0.1' }),
    ).resolves.toBe('user:u1');
  });

  it('匿名時用 IP，IPv6 依 /64 合併', async () => {
    vi.stubEnv('CLIENT_IP_HEADER', '');
    await expect(track({ ip: '::ffff:10.0.0.1' })).resolves.toBe('ip:10.0.0.1');
    await expect(track({ ip: '2001:db8:0:0:1::1' })).resolves.toBe(
      'ip:2001:db8::/64',
    );
  });

  it('查 session 失敗時改用 IP', async () => {
    vi.stubEnv('CLIENT_IP_HEADER', '');
    getSession.mockRejectedValueOnce(new Error('db down'));
    await expect(
      track({ headers: { 'x-test-user': 'u1' }, ip: '10.0.0.1' }),
    ).resolves.toBe('ip:10.0.0.1');
  });

  it('沒有 IP 時落到固定的一桶', async () => {
    vi.stubEnv('CLIENT_IP_HEADER', 'CF-Connecting-IP');
    await expect(track({ ip: '10.0.0.1' })).resolves.toBe('ip:missing');
  });
});

describe('THROTTLERS skipIf', () => {
  const context = (type: string) =>
    ({ getType: () => type }) as Parameters<
      NonNullable<(typeof THROTTLERS)[number]['skipIf']>
    >[0];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['', '', 'http', true],
    ['loopback', '', 'http', false],
    ['', 'CF-Connecting-IP', 'http', false],
    ['', '  ', 'http', true],
    ['loopback', 'CF-Connecting-IP', 'ws', true],
  ])(
    'TRUSTED_PROXIES=%j CLIENT_IP_HEADER=%j 的 %s 請求 skip=%s',
    (proxies, header, type, skipped) => {
      vi.stubEnv('TRUSTED_PROXIES', proxies);
      vi.stubEnv('CLIENT_IP_HEADER', header);
      for (const { skipIf } of THROTTLERS)
        expect(skipIf?.(context(type))).toBe(skipped);
    },
  );
});
