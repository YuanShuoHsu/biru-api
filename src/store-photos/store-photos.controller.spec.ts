import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { I18nModule } from 'nestjs-i18n';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { LanguageResolver } from '../common/resolvers/language.resolver.js';

import { StorePhotosController } from './store-photos.controller.js';
import { StorePhotosService } from './store-photos.service.js';

describe('StorePhotosController GET store-photos/active', () => {
  let app: INestApplication<App>;
  const findAllActive = vi.fn().mockResolvedValue([]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          fallbackLanguage: 'zh-TW',
          loaderOptions: { path: join(import.meta.dirname, '../i18n/') },
          resolvers: [LanguageResolver],
        }),
      ],
      controllers: [StorePhotosController],
      providers: [{ provide: StorePhotosService, useValue: { findAllActive } }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    findAllActive.mockClear();
  });

  it.each([
    ['?lang=en', {}, 'en'],
    ['?lang=zh-HK', {}, 'zh-TW'],
    ['?lang=constructor', { 'x-lang': 'ja' }, 'ja'],
    ['', { 'accept-language': 'ko-KR,ko;q=0.9' }, 'ko'],
    ['?lang=constructor', {}, 'zh-TW'],
  ])('%s %j 查詢 %s 的替代文字', async (query, headers, expected) => {
    await request(app.getHttpServer())
      .get(`/store-photos/active${query}`)
      .set(headers)
      .expect(200);

    expect(findAllActive).toHaveBeenCalledWith(expected);
  });
});
