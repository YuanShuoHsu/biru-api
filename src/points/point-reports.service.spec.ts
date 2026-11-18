import { PGlite } from '@electric-sql/pglite';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { PointReportsService } from './point-reports.service.js';
import { PointSettingsService } from './point-settings.service.js';

describe('PointReportsService', () => {
  let client: PGlite;
  let service: PointReportsService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema }) as unknown as DrizzleDB;
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: './drizzle',
    });
    service = new PointReportsService(db, new PointSettingsService(db));
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const addLot = (
    id: string,
    organizationId: string | null,
    {
      createdAt = '2026-10-05',
      expiresAt = '2027-10-05' as string | null,
      orderId = null as string | null,
      points,
      remaining,
      type = 'earn',
    }: {
      createdAt?: string;
      expiresAt?: string | null;
      orderId?: string | null;
      points: number;
      remaining: number;
      type?: string;
    },
  ) =>
    client.query(
      `insert into point_transaction (id, organization_id, points, remaining_points, type, user_id, created_at, expires_at, order_id)
       values ($1, $2, $3, $4, $5, 'amy', $6, $7, $8)`,
      [
        id,
        organizationId,
        points,
        remaining,
        type,
        createdAt,
        expiresAt,
        orderId,
      ],
    );

  const addPaidOrder = (id: string, sellerId: string, paymentDate: string) =>
    client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status, user_id)
       values ($1, '{"name":"客人"}', 'pickup', $1, 'Cash', $2, 100, $3, 'OrderDelivered', 'amy')`,
      [id, sellerId, paymentDate],
    );

  const addAllocation = (
    sourceTransactionId: string,
    sourceOrganizationId: string | null,
    points: number,
    {
      consumerTransactionId = null as string | null,
      createdAt = '2026-10-10',
      kind = 'redeem',
    } = {},
  ) =>
    client.query(
      `insert into point_allocation (id, consumer_transaction_id, kind, points, source_organization_id, source_transaction_id, user_id, created_at)
       values (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'amy', $6)`,
      [
        consumerTransactionId,
        kind,
        points,
        sourceOrganizationId,
        sourceTransactionId,
        createdAt,
      ],
    );

  const redeemFrom = async (
    id: string,
    sourceTransactionId: string,
    sourceOrganizationId: string | null,
    points: number,
    usedAt?: {
      at: string;
      orderStatus?: string;
      sellerId: string;
      discount: number;
    },
  ) => {
    if (usedAt)
      await client.query(
        `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status, user_id, discount)
         values ($1, '{"name":"客人"}', 'pickup', $1, 'Cash', $2, 100, $3, $4, 'amy', $5)`,
        [
          `order-${id}`,
          usedAt.sellerId,
          usedAt.at,
          usedAt.orderStatus ?? 'OrderDelivered',
          usedAt.discount,
        ],
      );
    await client.query(
      `insert into user_coupon (id, coupon_id, order_id, source, used_at, user_id) values ($1, 'voucher', $2, 'redeemed', $3, 'amy')`,
      [`uc-${id}`, usedAt ? `order-${id}` : null, usedAt?.at ?? null],
    );
    await client.query(
      `insert into point_transaction (id, points, type, user_coupon_id, user_id, created_at)
       values ($1, $2, 'redeem', $3, 'amy', '2026-10-10')`,
      [id, -points, `uc-${id}`],
    );
    await addAllocation(sourceTransactionId, sourceOrganizationId, points, {
      consumerTransactionId: id,
    });
  };

  beforeEach(async () => {
    await client.exec(
      `truncate point_allocation, point_transaction, user_coupon, coupon, "order", organization, "user" cascade;
       update point_setting set accounting_value_per_point = null;
       insert into "user" (id, name, email, first_name) values ('amy', 'amy', 'amy@example.com', 'amy');
       insert into coupon (id, code, discount_type, discount_value, points_cost) values ('voucher', 'VOUCHER', 'fixed', 10, 10);
       insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('a', 'Alpha', 'alpha', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('b', 'Beta', 'beta', now(), 'TW', '桃園市', '大園區', '中正東路一段');`,
    );

    await addLot('la', 'a', { points: 100, remaining: 30 });
    await addLot('la2', 'a', {
      createdAt: '2026-10-08',
      points: 5,
      remaining: 0,
    });
    await addLot('lx', 'a', {
      createdAt: '2025-10-10',
      expiresAt: '2026-10-10 15:59:59.999',
      points: 20,
      remaining: 20,
      type: 'adjust',
    });
    await addLot('lb', 'b', {
      createdAt: '2026-10-06',
      points: 50,
      remaining: 50,
    });
    await addLot('lb2', 'b', {
      createdAt: '2026-10-07',
      points: 10,
      remaining: 0,
    });
    await addLot('lb3', 'b', {
      createdAt: '2026-10-07',
      points: 7,
      remaining: 0,
    });
    await addLot('legacy', null, {
      createdAt: '2025-01-01',
      expiresAt: null,
      points: 30,
      remaining: 0,
    });

    await redeemFrom('r1', 'la', 'a', 60, {
      at: '2026-10-12',
      sellerId: 'b',
      discount: 60,
    });
    await redeemFrom('r2', 'lb2', 'b', 10, {
      at: '2026-10-20',
      sellerId: 'a',
      discount: 10,
    });
    await redeemFrom('r3', 'la2', 'a', 5);
    await redeemFrom('r4', 'lb3', 'b', 7, {
      at: '2026-10-21',
      orderStatus: 'OrderCancelled',
      sellerId: 'a',
      discount: 7,
    });
    await addAllocation('la', 'a', 10, {
      createdAt: '2026-11-02',
      kind: 'revoke',
    });
  });

  it('依發點門市列出當月發點、兌換、跨店使用、到期與月底流通中點數', async () => {
    const report = await service.getReport('2026-10');

    expect(report.accountingValuePerPoint).toBeNull();
    expect(report.rows).toEqual([
      expect.objectContaining({
        organizationId: 'a',
        organizationName: 'Alpha',
        earnedPoints: 105,
        grantedPoints: 0,
        redeemedPoints: 65,
        usedAtOwnStorePoints: 0,
        usedAtOtherStoresPoints: 60,
        otherStoresUsedHerePoints: 10,
        crossStoreNetPoints: 50,
        unusedRedeemedPoints: 5,
        revokedPoints: 0,
        expiredPoints: 20,
        outstandingPoints: 40,
        unallocatedLegacyPoints: 0,
        discountAmount: 10,
        amounts: null,
      }),
      expect.objectContaining({
        organizationId: 'b',
        earnedPoints: 67,
        redeemedPoints: 17,
        usedAtOtherStoresPoints: 10,
        otherStoresUsedHerePoints: 60,
        crossStoreNetPoints: -50,
        unusedRedeemedPoints: 0,
        expiredPoints: 0,
        outstandingPoints: 50,
        discountAmount: 60,
      }),
      expect.objectContaining({
        organizationId: null,
        organizationName: null,
        earnedPoints: 0,
        unallocatedLegacyPoints: 30,
      }),
    ]);
  });

  it('隔月的扣點算在隔月，並退回上個月底的流通中點數', async () => {
    const report = await service.getReport('2026-11');
    const alpha = report.rows.find((row) => row.organizationId === 'a');

    expect(alpha).toMatchObject({
      earnedPoints: 0,
      redeemedPoints: 0,
      revokedPoints: 10,
      expiredPoints: 0,
      outstandingPoints: 30,
      usedAtOtherStoresPoints: 0,
    });
  });

  it('設定每點會計價值時換算金額', async () => {
    await client.exec(
      `update point_setting set accounting_value_per_point = 2.5`,
    );

    const report = await service.getReport('2026-10');

    expect(report.accountingValuePerPoint).toBe('2.50');
    expect(report.rows[0].amounts).toEqual({
      earnedAmount: 262.5,
      grantedAmount: 0,
      redeemedAmount: 162.5,
      expiredAmount: 50,
      outstandingAmount: 100,
      crossStoreNetAmount: 125,
    });
  });

  it('跨店明細列出本店與各門市之間互相使用的點數', async () => {
    await expect(service.getDetail('a', '2026-10')).resolves.toEqual({
      month: '2026-10',
      organizationId: 'a',
      organizationName: 'Alpha',
      accountingValuePerPoint: null,
      rows: [
        {
          organizationId: 'b',
          organizationName: 'Beta',
          usedThereFromHerePoints: 60,
          usedHereFromTherePoints: 10,
          netPoints: 50,
          netAmount: null,
        },
      ],
    });
  });

  it('跨店明細在設定會計價值時換算淨額', async () => {
    await client.exec(
      `update point_setting set accounting_value_per_point = 2.5`,
    );

    const detail = await service.getDetail('b', '2026-10');

    expect(detail.rows).toEqual([
      expect.objectContaining({ organizationId: 'a', netAmount: -125 }),
    ]);
  });

  it('消費點數依訂單付款時間（Asia/Taipei 月份）入月，人工加點依建立時間', async () => {
    await addPaidOrder('paid-first', 'a', '2026-09-30 16:00:00');
    await addPaidOrder('paid-last', 'a', '2026-10-31 15:59:59');
    await addPaidOrder('paid-next', 'a', '2026-10-31 16:00:00');
    await addPaidOrder('paid-before', 'a', '2026-09-30 15:59:59');
    for (const [id, points] of [
      ['paid-first', 1],
      ['paid-last', 2],
      ['paid-next', 4],
      ['paid-before', 8],
    ] as const)
      await addLot(`lot-${id}`, 'a', {
        createdAt: '2026-11-03',
        orderId: id,
        points,
        remaining: points,
      });
    await addLot('granted', 'a', {
      createdAt: '2026-10-15',
      points: 12,
      remaining: 12,
      type: 'adjust',
    });

    const [october, november] = await Promise.all(
      ['2026-10', '2026-11'].map((month) => service.getReport(month)),
    );

    expect(october.rows[0]).toMatchObject({
      earnedPoints: 105 + 1 + 2,
      grantedPoints: 12,
      outstandingPoints: 40 + 1 + 2 + 8 + 12,
    });
    expect(november.rows[0]).toMatchObject({ earnedPoints: 4 });
  });

  it('本店的點數用在本店時只算進本店使用，不列在跨店明細', async () => {
    await addLot('own', 'a', { points: 8, remaining: 0 });
    await redeemFrom('r5', 'own', 'a', 8, {
      at: '2026-09-30 16:00:00',
      sellerId: 'a',
      discount: 8,
    });

    const [report, detail] = await Promise.all([
      service.getReport('2026-10'),
      service.getDetail('a', '2026-10'),
    ]);

    expect(report.rows[0]).toMatchObject({
      usedAtOwnStorePoints: 8,
      usedAtOtherStoresPoints: 60,
      crossStoreNetPoints: 50,
      discountAmount: 18,
    });
    expect(detail.rows.map(({ organizationId }) => organizationId)).toEqual([
      'b',
    ]);
  });

  it('尚未開始的月份回 400', async () => {
    await expect(service.getReport('2099-01')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('找不到門市時回 404', async () => {
    await expect(service.getDetail('missing', '2026-10')).rejects.toThrow(
      NotFoundException,
    );
  });
});
