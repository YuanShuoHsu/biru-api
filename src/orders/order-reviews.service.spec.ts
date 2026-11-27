import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { orderAccessToken } from './order-access-token.js';
import {
  ORDER_REVIEW_EDIT_WINDOW_MS,
  OrderReviewsService,
} from './order-reviews.service.js';
import { OrdersService } from './orders.service.js';

const amy = { id: 'amy', role: 'user' };
const bob = { id: 'bob', role: 'user' };
const staff = { id: 'staff', role: 'user' };

describe('OrderReviewsService', () => {
  let client: PGlite;
  let service: OrderReviewsService;
  let guestToken: string;

  beforeAll(async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-test-secret-test-secret');
    guestToken = orderAccessToken('guest-order');
    client = createPGlite();
    const db = drizzle(client, { schema }) as unknown as DrizzleDB;
    await migrate(db as never, { migrationsFolder: './drizzle' });
    const ordersService = new OrdersService(
      db,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service = new OrderReviewsService(db, ordersService);

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "user" (id, name, first_name, email, lang) values
         ('amy', 'Amy', 'Amy', 'amy@example.com', 'zh-TW'),
         ('bob', 'Bob', 'Bob', 'bob@example.com', 'zh-TW'),
         ('staff', 'Staff', 'Staff', 'staff@example.com', 'zh-TW');
       insert into member (id, organization_id, user_id, role, created_at) values
         ('staff-member', 'org', 'staff', 'member', now());
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, user_id) values
         ('guest-order', '{}', 'pickup', '1', 'OrderDelivered', 'Cash', 'org', 100, null),
         ('amy-order', '{}', 'pickup', '2', 'OrderDelivered', 'Cash', 'org', 100, 'amy'),
         ('amy-open', '{}', 'pickup', '3', 'OrderPickupAvailable', 'Cash', 'org', 100, 'amy');
       insert into order_item (id, menu_item_id, menu_item_name, order_id, order_quantity, unit_price) values
         ('latte', 'm1', 'Latte', 'guest-order', 1, 50),
         ('mocha', 'm2', 'Mocha', 'guest-order', 1, 50),
         ('amy-latte', 'm1', 'Latte', 'amy-order', 1, 100);`,
    );
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await client.close();
  });

  it('returns null before the customer leaves feedback', async () => {
    await expect(
      service.getReview('biru', 'guest-order', null, guestToken),
    ).resolves.toBeNull();
  });

  it('creates the review of a delivered order for a guest holding its access token', async () => {
    const review = await service.upsertReview(
      'biru',
      'guest-order',
      null,
      guestToken,
      {
        rating: 4,
        comment: '很好喝',
        items: [
          { orderItemId: 'latte', liked: true },
          { orderItemId: 'mocha', liked: false },
        ],
      },
    );

    expect(review).toMatchObject({
      rating: 4,
      comment: '很好喝',
      reply: null,
      repliedAt: null,
      items: [
        { orderItemId: 'latte', liked: true },
        { orderItemId: 'mocha', liked: false },
      ],
    });
    expect(review.editableUntil.getTime()).toBe(
      review.createdAt.getTime() + ORDER_REVIEW_EDIT_WINDOW_MS,
    );
  });

  it('replaces the rating, comment and item likes within 7 days', async () => {
    await service.upsertReview('biru', 'guest-order', null, guestToken, {
      rating: 2,
      items: [{ orderItemId: 'latte', liked: false }],
    });

    const review = await service.getReview(
      'biru',
      'guest-order',
      null,
      guestToken,
    );
    expect(review).toMatchObject({
      rating: 2,
      comment: null,
      items: [{ orderItemId: 'latte', liked: false }],
    });
    const { rows } = await client.query(
      'select count(*)::int as count from order_review',
    );
    expect(rows).toEqual([{ count: 1 }]);
  });

  it('shows the store reply to the customer', async () => {
    await client.query(
      `update order_review set reply = '謝謝', replied_at = now(), replied_by = 'staff' where order_id = 'guest-order'`,
    );

    await expect(
      service.getReview('biru', 'guest-order', null, guestToken),
    ).resolves.toMatchObject({ reply: '謝謝', repliedAt: expect.any(Date) });
  });

  it('locks the review 7 days after it was first sent', async () => {
    await client.query(
      `update order_review set created_at = now() - interval '7 days 1 minute' where order_id = 'guest-order'`,
    );

    await expect(
      service.upsertReview('biru', 'guest-order', null, guestToken, {
        rating: 5,
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'orderReviewLocked' },
    });
  });

  it('lets the signed-in customer review their own order and records them on it', async () => {
    await service.upsertReview('biru', 'amy-order', amy, null, { rating: 5 });

    const { rows } = await client.query(
      `select user_id from order_review where order_id = 'amy-order'`,
    );
    expect(rows).toEqual([{ user_id: 'amy' }]);
  });

  it('rejects an order that is not delivered yet', async () => {
    await expect(
      service.upsertReview('biru', 'amy-open', amy, null, { rating: 5 }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'orderNotDelivered' },
    });
  });

  it.each([
    ['another member', bob, null],
    ['a store member', staff, null],
    ['a guest without a token', null, null],
    ['a token of another order', null, 'guest-token'],
  ])('rejects feedback from %s', async (_, viewer, token) => {
    await expect(
      service.upsertReview(
        'biru',
        'amy-order',
        viewer,
        token === 'guest-token' ? guestToken : token,
        { rating: 1 },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('lets store members read but not write the review', async () => {
    await expect(
      service.getReview('biru', 'amy-order', staff, null),
    ).resolves.toMatchObject({ rating: 5 });
    await expect(
      service.getReview('biru', 'amy-order', bob, null),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects a liked item from another order', async () => {
    await expect(
      service.upsertReview('biru', 'amy-order', amy, null, {
        rating: 5,
        items: [{ orderItemId: 'latte', liked: true }],
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'orderItemNotFound' },
    });
  });

  it('answers 404 for an order of another store', async () => {
    await expect(
      service.upsertReview('other', 'amy-order', amy, null, { rating: 5 }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'orderNotFound' },
    });
  });
});
