import { BadRequestException } from '@nestjs/common';

import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { dineInTableToken } from './order-qr-token.js';
import { OrderQrService } from './order-qr.service.js';

const ORG_ID = 'org-1';

const createService = () => {
  const where = vi.fn().mockResolvedValue([{ id: ORG_ID, secret: null }]);
  const db = {
    select: vi.fn(() => ({
      from: () => ({ leftJoin: () => ({ where }) }),
    })),
  };
  return new OrderQrService(db as unknown as DrizzleDB);
};

describe('OrderQrService.getDineInTableToken', () => {
  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([1, 999])('signs table %i', async (tableNumber) => {
    await expect(
      createService().getDineInTableToken('shop', tableNumber),
    ).resolves.toEqual({ token: dineInTableToken(ORG_ID, null, tableNumber) });
  });

  it.each([0, -3, 1000])(
    'rejects table %i that a scan would never accept',
    async (tableNumber) => {
      await expect(
        createService().getDineInTableToken('shop', tableNumber),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
