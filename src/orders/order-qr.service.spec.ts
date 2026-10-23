import { BadRequestException } from '@nestjs/common';

import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { dineInTableToken } from './order-qr-token.js';
import { OrderQrService } from './order-qr.service.js';

const ORG_ID = 'org-1';

const createService = (dineInTableCount: number | null = 12) => {
  const rows = [{ dineInTableCount, id: ORG_ID, secret: null, slug: 'shop' }];
  const query = {
    from: () => query,
    leftJoin: () => query,
    limit: () => Promise.resolve(rows),
    where: () => Object.assign(Promise.resolve(rows), query),
  };
  const db = { select: vi.fn(() => query) };
  return new OrderQrService(db as unknown as DrizzleDB);
};

describe('OrderQrService', () => {
  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getDineInTableToken', () => {
    it.each([1, 12])('signs table %i', async (tableNumber) => {
      await expect(
        createService().getDineInTableToken('shop', tableNumber),
      ).resolves.toEqual({
        token: dineInTableToken(ORG_ID, null, tableNumber),
      });
    });

    it.each([0, -3, 13])(
      'rejects table %i outside the dine-in table count',
      async (tableNumber) => {
        await expect(
          createService().getDineInTableToken('shop', tableNumber),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );

    it('rejects every table when dine-in is not open', async () => {
      await expect(
        createService(null).getDineInTableToken('shop', 1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('scan', () => {
    const scan = (dineInTableCount: number | null, tableNumber: number) =>
      createService(dineInTableCount).scan('shop', {
        mode: 'dineIn',
        tableNumber,
        tableToken: dineInTableToken(ORG_ID, null, tableNumber),
      });

    it('issues a session for an open table', async () => {
      expect((await scan(12, 12))?.issued?.session).toMatchObject({
        mode: 'dineIn',
        tableNumber: 12,
      });
    });

    it.each([
      ['beyond a reduced table count', 12, 13],
      ['when dine-in is not open', null, 1],
    ])(
      'refuses a printed table QR code %s',
      async (_, dineInTableCount, tableNumber) => {
        expect(await scan(dineInTableCount, tableNumber)).toEqual({
          issued: null,
          slug: 'shop',
        });
      },
    );
  });
});
