import {
  type INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import type { App } from 'supertest/types.js';

import { ImagesController } from './images.controller.js';
import { ImagesService } from './images.service.js';

describe('ImagesController', () => {
  let app: INestApplication<App>;
  const find = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ImagesController],
      providers: [{ provide: ImagesService, useValue: { find } }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    [true, 'public, max-age=31536000, immutable'],
    [false, 'public, no-cache'],
  ])('目前版本為 %s 時回 200 與 %s', async (current, cacheControl) => {
    find.mockResolvedValueOnce({
      current,
      mimeType: 'image/png',
      data: Buffer.from('iVBORw0KGgo=', 'base64'),
    });

    const response = await request(app.getHttpServer())
      .get('/images/banner/7f3c5b2e-8a1d-4c6f-9e2b-1a2b3c4d5e6f/1.png')
      .expect(200);

    expect(response.headers['cache-control']).toBe(cacheControl);
    expect(response.headers['content-type']).toBe('image/png');
  });

  it('找不到圖片時回 404 且不帶快取標頭', async () => {
    find.mockRejectedValueOnce(new NotFoundException());

    const response = await request(app.getHttpServer())
      .get('/images/banner/7f3c5b2e-8a1d-4c6f-9e2b-1a2b3c4d5e6f/1.png')
      .expect(404);

    expect(response.headers['cache-control']).toBeUndefined();
  });
});
