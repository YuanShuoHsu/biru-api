import {
  ForbiddenException,
  type CanActivate,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import request from 'supertest';
import type { App } from 'supertest/types.js';

import { CouponsController } from '../../coupons/coupons.controller.js';
import { GcisController } from '../../gcis/gcis.controller.js';
import { OrdersController } from '../../orders/orders.controller.js';
import { WaitlistController } from '../../waitlist/waitlist.controller.js';

import { THROTTLERS } from './throttle.js';

class RejectAfterThrottle implements CanActivate {
  canActivate(): boolean {
    throw new ForbiddenException();
  }
}

const ANONYMOUS_ROUTES = [
  ['post', '/organizations/shop/orders', 10],
  ['post', '/organizations/shop/waitlist/tickets', 5],
  ['post', '/organizations/shop/coupons/validate', 10],
  ['get', '/gcis/12345678', 20],
] as const;

describe('THROTTLERS', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: THROTTLERS })],
      controllers: [
        CouponsController,
        GcisController,
        OrdersController,
        WaitlistController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: RejectAfterThrottle },
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
  });

  const send = (method: 'get' | 'post', path: string) =>
    request(app.getHttpServer())[method](path);

  const expectLimit = async (
    method: 'get' | 'post',
    path: string,
    limit: number,
  ) => {
    for (let i = 0; i < limit; i++) await send(method, path).expect(403);
    await send(method, path).expect(429);
  };

  describe('設定 TRUSTED_PROXIES 時', () => {
    beforeEach(() => {
      vi.stubEnv('TRUSTED_PROXIES', 'loopback');
    });

    it.each(ANONYMOUS_ROUTES)(
      '%s %s 每分鐘 %i 次',
      async (method, path, limit) => {
        await expectLimit(method, path, limit);

        vi.advanceTimersByTime(61_000);
        await send(method, path).expect(403);
      },
    );

    it('驗優惠碼每小時 50 次', async () => {
      const path = '/organizations/shop/coupons/validate';
      for (let minute = 0; minute < 5; minute++) {
        for (let i = 0; i < 10; i++) await send('post', path).expect(403);
        vi.advanceTimersByTime(61_000);
      }

      await send('post', path).expect(429);
      vi.advanceTimersByTime(61_000);
      await send('post', path).expect(429);

      vi.advanceTimersByTime(60 * 60_000);
      await send('post', path).expect(403);
    });

    it('沒有 @Throttle 的路由維持每分鐘 100 次，也沒有具名 throttler 的標頭', async () => {
      const path = '/organizations/shop/coupons/available';
      const first = await send('get', path).expect(403);
      expect(first.headers['x-ratelimit-limit']).toBe('100');
      expect(first.headers['x-ratelimit-limit-anonymous']).toBeUndefined();
      expect(first.headers['x-ratelimit-limit-hourly']).toBeUndefined();

      await expectLimit('get', path, 99);

      vi.advanceTimersByTime(61_000);
      await expectLimit('get', path, 100);
    });
  });

  describe('沒設 TRUSTED_PROXIES 時', () => {
    beforeEach(() => {
      vi.stubEnv('TRUSTED_PROXIES', '');
    });

    it.each(ANONYMOUS_ROUTES)(
      '%s %s 維持每分鐘 100 次',
      async (method, path) => {
        await expectLimit(method, path, 100);
      },
    );
  });
});
