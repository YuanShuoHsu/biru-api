import {
  type INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthService } from '@thallesp/nestjs-better-auth';

import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AuthBatchService } from '../auth/auth-batch.service.js';

import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController.findImage', () => {
  let app: INestApplication<App>;
  const findImage = vi.fn();
  const getSession = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: { findImage } },
        { provide: AuthBatchService, useValue: {} },
        { provide: AuthService, useValue: { api: { getSession } } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  beforeEach(() => {
    getSession.mockResolvedValue({ user: { role: 'admin' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    [true, 'private, max-age=31536000, immutable'],
    [false, 'private, no-cache'],
  ])('目前版本為 %s 時回 200 與 %s', async (current, cacheControl) => {
    findImage.mockResolvedValueOnce({
      current,
      mimeType: 'image/webp',
      data: Buffer.from('UklGRg==', 'base64'),
    });

    const response = await request(app.getHttpServer())
      .get('/users/user-1/image/0123456789abcdef.webp')
      .expect(200);

    expect(findImage).toHaveBeenLastCalledWith({
      id: 'user-1',
      version: '0123456789abcdef',
      extension: 'webp',
    });
    expect(response.headers['cache-control']).toBe(cacheControl);
    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.headers['cross-origin-resource-policy']).toBe(
      'cross-origin',
    );
  });

  it('版本不是十六進位雜湊時回 400 且不讀頭像', async () => {
    findImage.mockClear();

    await request(app.getHttpServer())
      .get('/users/user-1/image/latest.webp')
      .expect(400);

    expect(findImage).not.toHaveBeenCalled();
  });

  it('找不到頭像時回 404 且不帶快取標頭', async () => {
    findImage.mockRejectedValueOnce(new NotFoundException());

    const response = await request(app.getHttpServer())
      .get('/users/user-1/image/0123456789abcdef.webp')
      .expect(404);

    expect(response.headers['cache-control']).toBeUndefined();
  });

  it('不是平台管理員時回 403 且不讀頭像', async () => {
    findImage.mockClear();
    getSession.mockResolvedValueOnce({ user: { role: 'user' } });

    await request(app.getHttpServer())
      .get('/users/user-1/image/0123456789abcdef.webp')
      .expect(403);

    expect(findImage).not.toHaveBeenCalled();
  });
});
