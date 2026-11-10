import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { I18nModule } from 'nestjs-i18n';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { LanguageResolver } from '../common/resolvers/language.resolver.js';

import { PublicMenusController } from './menus-public.controller.js';
import { PublicMenusService } from './menus-public.service.js';

describe('PublicMenusController GET organizations/:organizationId/order-menu', () => {
  let app: INestApplication<App>;
  const findOrderMenu = vi.fn().mockResolvedValue(null);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          fallbackLanguage: 'zh-TW',
          loaderOptions: { path: join(import.meta.dirname, '../i18n/') },
          resolvers: [LanguageResolver],
        }),
      ],
      controllers: [PublicMenusController],
      providers: [{ provide: PublicMenusService, useValue: { findOrderMenu } }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    findOrderMenu.mockClear();
  });

  it.each([
    ['?lang=ja', {}, 'ja'],
    ['?lang=zh-Hant', {}, 'zh-TW'],
    ['?lang=constructor', { 'x-lang': 'en' }, 'en'],
    ['', { 'accept-language': 'zh-CN' }, 'zh-CN'],
    ['?lang=constructor', {}, 'zh-TW'],
  ])('%s %j 查詢 %s 的菜單', async (query, headers, expected) => {
    await request(app.getHttpServer())
      .get(`/organizations/org-1/order-menu${query}`)
      .set(headers)
      .expect(200);

    expect(findOrderMenu).toHaveBeenCalledWith('org-1', expected);
  });
});
