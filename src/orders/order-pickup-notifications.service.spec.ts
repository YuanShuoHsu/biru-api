import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { NotificationsService } from '../push/notifications.service.js';

import { orderAccessToken } from './order-access-token.js';
import { OrderPickupNotificationsService } from './order-pickup-notifications.service.js';

describe('OrderPickupNotificationsService.onStatusUpdated', () => {
  let client: PGlite;
  let service: OrderPickupNotificationsService;
  const notify = vi.fn<NotificationsService['notify']>();

  beforeAll(async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new OrderPickupNotificationsService(
      db as unknown as DrizzleDB,
      { notify } as unknown as NotificationsService,
    );
    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
      insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, order_status)
        values ('o1', '{"name":"王小明"}', 'dineIn', '12', 'Cash', 'org', 100, 'OrderPickupAvailable');
    `);
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await client.close();
  });

  beforeEach(() => {
    notify.mockReset();
  });

  it('推進到可取餐時推播訂單編號，點開回到帶存取權杖的訂單完成頁', async () => {
    await service.onStatusUpdated({
      orderId: 'o1',
      orderStatus: 'OrderPickupAvailable',
      organizationId: 'org',
      direction: 'advance',
    });

    const search = new URLSearchParams({
      orderId: 'o1',
      accessToken: orderAccessToken('o1'),
    });
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      { orderId: 'o1' },
      {
        push: {
          title: 'push.order_pickup_available.title',
          body: 'push.order_pickup_available.body',
          args: { orderNumber: '12', organizationName: 'Biru' },
          path: `/order/dine-in/biru/complete?${search}`,
          ttlSeconds: 3600,
        },
        email: null,
      },
    );
  });

  it('從已取餐退回可取餐、或其他狀態都不推播', async () => {
    await service.onStatusUpdated({
      orderId: 'o1',
      orderStatus: 'OrderPickupAvailable',
      organizationId: 'org',
      direction: 'revert',
    });
    await service.onStatusUpdated({
      orderId: 'o1',
      orderStatus: 'OrderDelivered',
      organizationId: 'org',
      direction: 'advance',
    });

    expect(notify).not.toHaveBeenCalled();
  });
});
