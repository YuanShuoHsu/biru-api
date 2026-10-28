import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

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
  const pglite = db as unknown as PgliteDatabase;
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
    request(app.getHttpServer()).get('/api/users').expect(401));

  it('已移除的 /api/hello 回 404', () =>
    request(app.getHttpServer()).get('/api/hello').expect(404));
});
