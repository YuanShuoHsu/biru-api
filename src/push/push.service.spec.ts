import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { DEFAULT_LANGUAGE } from '../db/schema/enums.js';
import * as schema from '../db/schema/index.js';
import { pushSubscription } from '../db/schema/push.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { OrderQrService } from '../orders/order-qr.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import { WaitlistService } from '../waitlist/waitlist.service.js';

import type { CreatePushSubscriptionDto } from './dto/push-subscription.dto.js';
import { PushService } from './push.service.js';

const AMY = { id: 'amy', role: 'user' };
const ENDPOINT = 'https://push.example.com/send/abc';

const subscription = (
  overrides: Partial<CreatePushSubscriptionDto> = {},
): CreatePushSubscriptionDto => ({
  endpoint: ENDPOINT,
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  app: 'storefront',
  ...overrides,
});

describe('PushService', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: PushService;
  const canReadOrderById = vi.fn<OrdersService['canReadOrderById']>();

  const rows = () => db.select().from(pushSubscription);

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new PushService(
      db as unknown as DrizzleDB,
      { canReadOrderById } as unknown as OrdersService,
      new WaitlistService(
        db as unknown as DrizzleDB,
        {} as EventEmitter2,
        new OrderQrService(db as unknown as DrizzleDB),
      ),
    );
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'), ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "user" (id, name, first_name, email, lang) values ('amy', 'Amy', 'Amy', 'amy@example.com', 'zh-TW');
       insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, order_status) values ('o1', '{"name":"客人"}', 'pickup', '1', 'Cash', 'org', 100, 'OrderPaymentDue');
       insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale) values ('t1', 'org', current_date, 'A', 1, 2, 'zh-TW');
       insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status) values ('seated', 'org', current_date, 'A', 2, 2, 'zh-TW', 'seated');`,
    );
  }, 120_000);

  afterEach(async () => {
    canReadOrderById.mockReset();
    await db.delete(pushSubscription);
  });

  afterAll(async () => {
    await client.close();
  });

  it('binds a signed-in caller to their user', async () => {
    await service.subscribe(subscription({ lang: 'ja' }), AMY);

    expect(await rows()).toEqual([
      expect.objectContaining({
        endpoint: ENDPOINT,
        p256dh: 'p256dh-key',
        auth: 'auth-key',
        app: 'storefront',
        lang: 'ja',
        userId: 'amy',
        orderId: null,
        waitlistTicketId: null,
      }),
    ]);
  });

  it('binds an anonymous caller to an order its access token can read', async () => {
    canReadOrderById.mockResolvedValue(true);

    await service.subscribe(
      subscription({ orderId: 'o1', accessToken: 'token' }),
      null,
    );

    expect(canReadOrderById).toHaveBeenCalledWith('o1', null, 'token');
    expect(await rows()).toEqual([
      expect.objectContaining({
        lang: DEFAULT_LANGUAGE,
        orderId: 'o1',
        userId: null,
      }),
    ]);
  });

  it('rejects an order the caller cannot read', async () => {
    canReadOrderById.mockResolvedValue(false);

    await expect(
      service.subscribe(
        subscription({ orderId: 'o1', accessToken: 'wrong' }),
        null,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.subscribe(subscription({ orderId: 'o1' }), AMY),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await rows()).toEqual([]);
  });

  it('binds an anonymous caller to a waitlist ticket of the store', async () => {
    await service.subscribe(
      subscription({ organizationSlug: 'biru', waitlistTicketId: 't1' }),
      null,
    );

    expect(await rows()).toEqual([
      expect.objectContaining({ waitlistTicketId: 't1', userId: null }),
    ]);
  });

  it.each([
    ['an unknown ticket', 'biru', 'nope', NotFoundException],
    ['a ticket of another store', 'other', 't1', NotFoundException],
    ['a ticket that has ended', 'biru', 'seated', BadRequestException],
  ])('rejects %s', async (_, organizationSlug, waitlistTicketId, error) => {
    await expect(
      service.subscribe(
        subscription({ organizationSlug, waitlistTicketId }),
        null,
      ),
    ).rejects.toBeInstanceOf(error);
    expect(await rows()).toEqual([]);
  });

  it('rejects an anonymous caller without a target', async () => {
    await expect(
      service.subscribe(subscription(), null),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.subscribe(subscription({ accessToken: 'token' }), null),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(canReadOrderById).not.toHaveBeenCalled();
    expect(await rows()).toEqual([]);
  });

  it('only lets a signed-in caller subscribe the admin app', async () => {
    canReadOrderById.mockResolvedValue(true);

    await expect(
      service.subscribe(
        subscription({ app: 'admin', orderId: 'o1', accessToken: 'token' }),
        null,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await rows()).toEqual([]);

    await service.subscribe(subscription({ app: 'admin' }), AMY);
    expect(await rows()).toEqual([
      expect.objectContaining({ app: 'admin', userId: 'amy' }),
    ]);
  });

  it('replaces the row when the same endpoint subscribes again', async () => {
    canReadOrderById.mockResolvedValue(true);
    await service.subscribe(subscription(), AMY);
    const [first] = await rows();

    await service.subscribe(
      subscription({
        keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
        orderId: 'o1',
        accessToken: 'token',
      }),
      null,
    );

    const [replaced, ...rest] = await rows();
    expect(rest).toEqual([]);
    expect(replaced).toMatchObject({
      id: first.id,
      p256dh: 'new-p256dh',
      auth: 'new-auth',
      userId: null,
      orderId: 'o1',
    });
    expect(replaced.updatedAt.getTime()).toBeGreaterThanOrEqual(
      first.updatedAt.getTime(),
    );
  });

  it('deletes by endpoint and ignores an unknown one', async () => {
    await service.subscribe(subscription(), AMY);

    await service.unsubscribe({ endpoint: ENDPOINT });
    await service.unsubscribe({ endpoint: ENDPOINT });

    expect(await rows()).toEqual([]);
  });
});
