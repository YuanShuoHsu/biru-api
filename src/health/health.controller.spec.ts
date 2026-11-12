import {
  type INestApplication,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';

import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import { DatabaseHealthIndicator } from './database.health.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let app: INestApplication<App>;
  const execute = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule.forRoot({ logger: false })],
      controllers: [HealthController],
      providers: [
        DatabaseHealthIndicator,
        { provide: DRIZZLE, useValue: { execute } },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    execute.mockReset();
    vi.useRealTimers();
  });

  it('資料庫正常時回 200 與 ok', async () => {
    execute.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      info: { database: { status: 'up' } },
      error: {},
      details: { database: { status: 'up' } },
    });
  });

  it('查詢失敗時回 503，回應不帶原始錯誤訊息', async () => {
    execute.mockRejectedValueOnce(
      new Error('getaddrinfo ENOTFOUND db.secret-host.supabase.co'),
    );

    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(503);

    expect(response.body).toMatchObject({
      status: 'error',
      error: { database: { status: 'down' } },
      details: { database: { status: 'down' } },
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-host');
  });

  it('查詢超過 3 秒時回 503，回應不帶錯誤訊息', async () => {
    vi.useFakeTimers();
    execute.mockReturnValueOnce(new Promise(() => {}));

    const result = app
      .get(HealthController)
      .check()
      .catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(3000);
    const error = await result;

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      status: 'error',
      info: {},
      error: { database: { status: 'down' } },
      details: { database: { status: 'down' } },
    });
  });
});
