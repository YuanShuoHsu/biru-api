import type { PGlite } from '@electric-sql/pglite';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { from, lastValueFrom } from 'rxjs';

import { createPGlite } from '../../test/pglite.js';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { ReplyOrderReviewDto } from './dto/store-order-review.dto.js';
import { OrderReviewRepliesController } from './order-review-replies.controller.js';
import { OrderReviewsService } from './order-reviews.service.js';

describe('OrderReviewsService (store)', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let service: OrderReviewsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema }) as unknown as DrizzleDB;
    await migrate(db as never, { migrationsFolder: './drizzle' });
    service = new OrderReviewsService(db, {} as never);

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "user" (id, name, first_name, email, lang) values
         ('staff', 'Staff', 'Staff', 'staff@example.com', 'zh-TW'),
         ('amy', 'Amy', 'Amy', 'amy@example.com', 'zh-TW');
       insert into "order" (id, customer, mode, order_number, confirmation_number, order_status, payment_method, seller_id, subtotal) values
         ('o1', '{}', 'pickup', '1', 'A001', 'OrderDelivered', 'Cash', 'org', 100),
         ('o2', '{}', 'pickup', '2', null, 'OrderDelivered', 'Cash', 'org', 100),
         ('o3', '{}', 'pickup', '3', null, 'OrderDelivered', 'Cash', 'org', 100),
         ('x1', '{}', 'pickup', '1', null, 'OrderDelivered', 'Cash', 'other', 100);
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, user_id, updated_at) values
         ('old-guest', '{"name":"王小明","email":"ming@example.com"}', 'pickup', '4', 'OrderDelivered', 'Cash', 'other', 100, null, now() - interval '31 days'),
         ('erased-guest', '{"name":"王**"}', 'pickup', '5', 'OrderDelivered', 'Cash', 'other', 100, null, now()),
         ('old-member', '{"name":"Amy"}', 'pickup', '6', 'OrderDelivered', 'Cash', 'other', 100, 'amy', now() - interval '1 year'),
         ('old-open-guest', '{"name":"王小明"}', 'pickup', '7', 'OrderProcessing', 'Cash', 'other', 100, null, now() - interval '31 days');
       insert into order_item (id, menu_item_id, menu_item_name, order_id, order_quantity, unit_price) values
         ('o1-latte', 'm1', 'Latte', 'o1', 1, 50),
         ('o1-mocha', 'm2', 'Mocha', 'o1', 1, 50);
       insert into order_review (id, order_id, organization_id, rating, comment, reply, replied_at, replied_by, created_at) values
         ('r1', 'o1', 'org', 5, '很好喝', null, null, null, '2026-11-01 02:00:00'),
         ('r2', 'o2', 'org', 2, '太甜', '下次少糖', now(), 'staff', '2026-11-10 02:00:00'),
         ('r3', 'o3', 'org', 4, null, null, null, null, '2026-11-20 02:00:00'),
         ('rx', 'x1', 'other', 1, '其他店', null, null, null, '2026-11-15 02:00:00'),
         ('r-old-guest', 'old-guest', 'other', 3, '普通', '謝謝', now(), 'staff', '2026-10-01 02:00:00'),
         ('r-erased-guest', 'erased-guest', 'other', 3, null, null, null, null, '2026-10-02 02:00:00'),
         ('r-old-member', 'old-member', 'other', 3, '普通', null, null, null, '2026-10-03 02:00:00'),
         ('r-old-open-guest', 'old-open-guest', 'other', 3, '普通', null, null, null, '2026-10-04 02:00:00');
       insert into order_review_item (id, review_id, order_item_id, liked) values
         ('r1-latte', 'r1', 'o1-latte', true),
         ('r1-mocha', 'r1', 'o1-mocha', false);`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const idsOf = async (
    query: Parameters<OrderReviewsService['listForOrganization']>[1],
  ) =>
    (await service.listForOrganization('org', query)).data.map(({ id }) => id);

  it("lists only the store's reviews, newest first, with the order numbers and item names", async () => {
    const { data, total } = await service.listForOrganization('org');

    expect(total).toBe(3);
    expect(data.map(({ id }) => id)).toEqual(['r3', 'r2', 'r1']);
    expect(data[2]).toEqual({
      id: 'r1',
      orderId: 'o1',
      orderNumber: '1',
      confirmationNumber: 'A001',
      rating: 5,
      comment: '很好喝',
      items: [
        { orderItemId: 'o1-latte', menuItemName: 'Latte', liked: true },
        { orderItemId: 'o1-mocha', menuItemName: 'Mocha', liked: false },
      ],
      reply: null,
      repliedAt: null,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
      canReply: true,
    });
  });

  it.each([
    [
      { filterField: 'rating', filterOperator: '>=', filterValue: '4' },
      ['r3', 'r1'],
    ],
    [{ filterField: 'rating', filterOperator: '=', filterValue: '2' }, ['r2']],
    [
      { filterField: 'hasReply', filterOperator: 'is', filterValue: 'true' },
      ['r2'],
    ],
    [
      { filterField: 'hasReply', filterOperator: 'is', filterValue: 'false' },
      ['r3', 'r1'],
    ],
    [
      {
        filterField: 'createdAt',
        filterOperator: 'onOrAfter',
        filterValue: '2026-11-10',
      },
      ['r3', 'r2'],
    ],
    [
      {
        filterField: 'createdAt',
        filterOperator: 'before',
        filterValue: '2026-11-10',
      },
      ['r1'],
    ],
    [{ quickFilterValue: 'A001' }, ['r1']],
    [{ quickFilterValue: '少糖' }, ['r2']],
  ] as const)('filters by %j', async (query, expected) => {
    expect(await idsOf(query)).toEqual(expected);
  });

  it('sorts by rating and pages the list', async () => {
    expect(await idsOf({ sortBy: 'rating', sortDirection: 'asc' })).toEqual([
      'r2',
      'r3',
      'r1',
    ]);
    await expect(
      service.listForOrganization('org', {
        sortBy: 'rating',
        sortDirection: 'desc',
        limit: 1,
        offset: 1,
      }),
    ).resolves.toMatchObject({ data: [{ id: 'r3' }], total: 3 });
  });

  it('records the reply with who sent it and when, and replaces an earlier reply', async () => {
    await expect(
      service.reply('org', 'r1', 'staff', '謝謝光臨'),
    ).resolves.toMatchObject({
      id: 'r1',
      reply: '謝謝光臨',
      repliedAt: expect.any(Date),
      items: [{ orderItemId: 'o1-latte' }, { orderItemId: 'o1-mocha' }],
    });
    await service.reply('org', 'r1', 'staff', '再次謝謝');

    const { rows } = await client.query(
      `select reply, replied_by from order_review where id = 'r1'`,
    );
    expect(rows).toEqual([{ reply: '再次謝謝', replied_by: 'staff' }]);
  });

  it('removes the reply', async () => {
    await expect(service.removeReply('org', 'r2')).resolves.toMatchObject({
      id: 'r2',
      reply: null,
      repliedAt: null,
    });

    const { rows } = await client.query(
      `select reply, replied_at, replied_by from order_review where id = 'r2'`,
    );
    expect(rows).toEqual([{ reply: null, replied_at: null, replied_by: null }]);
  });

  it.each([
    ['another store', 'rx'],
    ['an unknown id', 'missing'],
  ])('answers 404 for a review of %s', async (_, reviewId) => {
    for (const attempt of [
      service.reply('org', reviewId, 'staff', '謝謝'),
      service.removeReply('org', reviewId),
    ])
      await expect(attempt).rejects.toMatchObject({
        status: 404,
        response: { code: 'orderReviewNotFound' },
      });

    const { rows } = await client.query(
      `select reply from order_review where id = 'rx'`,
    );
    expect(rows).toEqual([{ reply: null }]);
  });

  it.each([
    ['past the personal data retention period', 'r-old-guest'],
    ['already de-identified', 'r-erased-guest'],
  ])(
    'refuses to reply to a review of a guest order %s, since the reply would be erased',
    async (_, reviewId) => {
      const { rows: before } = await client.query(
        `select reply from order_review where id = $1`,
        [reviewId],
      );

      await expect(
        service.reply('other', reviewId, 'staff', '謝謝'),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'orderReviewReplyExpired' },
      });

      const { rows } = await client.query(
        `select reply from order_review where id = $1`,
        [reviewId],
      );
      expect(rows).toEqual(before);
    },
  );

  it.each([
    ['a member order however old', 'r-old-member'],
    ['a guest order that has not ended', 'r-old-open-guest'],
  ])('replies to a review of %s', async (_, reviewId) => {
    await expect(
      service.reply('other', reviewId, 'staff', '謝謝'),
    ).resolves.toMatchObject({ id: reviewId, reply: '謝謝', canReply: true });
  });

  it('still removes the reply on a guest order past the retention period', async () => {
    await expect(
      service.removeReply('other', 'r-old-guest'),
    ).resolves.toMatchObject({
      id: 'r-old-guest',
      reply: null,
      canReply: false,
    });
  });

  it('tells whether each review can still be replied to', async () => {
    const { data } = await service.listForOrganization('other');

    expect(
      Object.fromEntries(data.map(({ id, canReply }) => [id, canReply])),
    ).toEqual({
      rx: true,
      'r-old-guest': false,
      'r-erased-guest': false,
      'r-old-member': true,
      'r-old-open-guest': true,
    });
  });

  it.each([
    ['blank', '   '],
    ['empty', ''],
    ['missing', undefined],
    ['over 1000 characters', 'a'.repeat(1001)],
  ])('rejects a %s reply', async (_, reply) => {
    const errors = await validate(
      plainToInstance(ReplyOrderReviewDto, { reply }),
    );

    expect(errors.map(({ property }) => property)).toEqual(['reply']);
  });

  it('trims the reply', () => {
    expect(
      plainToInstance(ReplyOrderReviewDto, { reply: '  謝謝  ' }).reply,
    ).toBe('謝謝');
  });

  it('records removing a reply as an update of the review in the audit log', async () => {
    await service.reply('org', 'r3', 'staff', '謝謝');
    const interceptor = new AuditInterceptor(new Reflector(), db);
    const request = {
      method: 'DELETE',
      organizationId: 'org',
      params: { organizationSlug: 'biru', reviewId: 'r3' },
      user: { id: 'staff', name: 'Staff', email: 'staff@example.com' },
    };
    const handler: unknown = Reflect.get(
      OrderReviewRepliesController.prototype,
      'removeReply',
    );
    const context = {
      getClass: () => OrderReviewRepliesController,
      getHandler: () => handler,
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => from(service.removeReply('org', 'r3')),
    };

    await lastValueFrom(interceptor.intercept(context, next));

    await vi.waitFor(async () =>
      expect(await db.select().from(schema.auditLog)).toEqual([
        expect.objectContaining({
          action: 'update',
          resource: 'orderReview',
          resourceId: 'r3',
          ancestorIds: ['o3'],
          changes: expect.objectContaining({
            reply: { before: '謝謝', after: null },
            repliedBy: { before: 'staff', after: null },
          }),
        }),
      ]),
    );
  });
});
