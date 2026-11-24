import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { I18nModule } from 'nestjs-i18n';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { LanguageResolver } from '../common/resolvers/language.resolver.js';

import { MenuPdfService } from './menu-pdf.service.js';
import { MenusController } from './menus.controller.js';

describe('MenusController GET organizations/:organizationId/order-menu/pdf', () => {
  let app: INestApplication<App>;
  const orderMenu = vi.fn().mockResolvedValue(Buffer.from('%PDF-1.3'));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          fallbackLanguage: 'zh-TW',
          loaderOptions: { path: join(import.meta.dirname, '../i18n/') },
          resolvers: [LanguageResolver],
        }),
      ],
      controllers: [MenusController],
      providers: [{ provide: MenuPdfService, useValue: { orderMenu } }],
    })
      .useMocker(() => ({}))
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the store menu as an inline pdf in the requested language', async () => {
    const response = await request(app.getHttpServer())
      .get('/organizations/org-1/order-menu/pdf?lang=ja')
      .expect(200)
      .expect('content-type', 'application/pdf')
      .expect('content-disposition', 'inline; filename="menu.pdf"');

    expect(orderMenu).toHaveBeenCalledWith('org-1', 'ja');
    expect(Buffer.from(response.body as Buffer).toString()).toBe('%PDF-1.3');
  });
});
