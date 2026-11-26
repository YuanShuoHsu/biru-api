import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';

import type { ConfigService } from '@nestjs/config';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';
import webpush from 'web-push';

import { createPGlite } from '../../test/pglite.js';
import { languagesEnum } from '../db/schema/enums.js';
import * as schema from '../db/schema/index.js';
import { pushSubscription } from '../db/schema/push.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import {
  NotificationsService,
  type PushMessage,
} from './notifications.service.js';
import { resolvePublicAddresses } from './public-address.js';

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));

vi.mock('web-push', async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof webpush }>();
  return { default: { ...actual.default, sendNotification } };
});

vi.mock('./public-address.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./public-address.js')>()),
  resolvePublicAddresses: vi.fn(),
}));

const VAPID = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'public-key',
  VAPID_PRIVATE_KEY: 'private-key',
  VAPID_SUBJECT: 'mailto:push@example.com',
};

const CALLED: PushMessage = {
  title: 'push.waitlist_called.title',
  body: 'push.waitlist_called.body',
  args: { organizationName: 'Biru', ticketNumber: 'A001' },
  path: '/waitlist/biru/t1',
  ttlSeconds: 600,
};

const webPushError = (statusCode: number) =>
  new webpush.WebPushError(
    'Received unexpected response code',
    statusCode,
    {},
    '',
    '',
  );

describe('NotificationsService.notify', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const email = vi.fn<() => Promise<void>>();
  const i18n = {
    t: (key: string, { lang, args }: { lang: string; args: object }) =>
      `${lang}|${key}|${JSON.stringify(args)}`,
  } as unknown as I18nService<I18nTranslations>;

  const serviceWith = (env: Record<string, string>) =>
    new NotificationsService(db as unknown as DrizzleDB, i18n, {
      get: (name: string) => env[name],
    } as unknown as ConfigService);

  const subscribe = (id: string, lang = 'zh-TW', ticket = 't1') =>
    db.insert(pushSubscription).values({
      id,
      endpoint: `https://push.example.com/${id}`,
      p256dh: `${id}-p256dh`,
      auth: `${id}-auth`,
      lang: lang as never,
      app: 'storefront',
      waitlistTicketId: ticket,
    });

  const subscriptionIds = async () =>
    (await db.select({ id: pushSubscription.id }).from(pushSubscription))
      .map(({ id }) => id)
      .sort();

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale) values ('t1', 'org', current_date, 'A', 1, 2, 'zh-TW'), ('t2', 'org', current_date, 'A', 2, 2, 'zh-TW');`,
    );
  }, 120_000);

  beforeEach(() => {
    vi.mocked(resolvePublicAddresses).mockResolvedValue([
      { address: '142.250.196.10', family: 4 },
    ]);
    sendNotification.mockResolvedValue({ statusCode: 201 });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await db.delete(pushSubscription);
  });

  afterAll(async () => {
    await client.close();
  });

  it('pushes to every subscription of the ticket in its language and sends no email', async () => {
    await subscribe('a', 'ja');
    await subscribe('b', 'en');
    await subscribe('other', 'ko', 't2');

    await serviceWith(VAPID).notify(
      { waitlistTicketId: 't1' },
      { push: CALLED, email },
    );

    expect(email).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example.com/a',
        keys: { p256dh: 'a-p256dh', auth: 'a-auth' },
      },
      JSON.stringify({
        title: `ja|push.waitlist_called.title|${JSON.stringify(CALLED.args)}`,
        body: `ja|push.waitlist_called.body|${JSON.stringify(CALLED.args)}`,
        path: '/ja/waitlist/biru/t1',
      }),
      {
        agent: expect.any(Agent),
        timeout: 10_000,
        TTL: 600,
        urgency: 'high',
        vapidDetails: {
          publicKey: 'public-key',
          privateKey: 'private-key',
          subject: 'mailto:push@example.com',
        },
      },
    );
    expect(resolvePublicAddresses).toHaveBeenCalledWith('push.example.com');
  });

  it('emails when the ticket has no subscription', async () => {
    await subscribe('other', 'ko', 't2');

    await serviceWith(VAPID).notify(
      { waitlistTicketId: 't1' },
      { push: CALLED, email },
    );

    expect(sendNotification).not.toHaveBeenCalled();
    expect(email).toHaveBeenCalledOnce();
  });

  it('pushes an order only to the subscriptions bound to that order', async () => {
    await client.exec(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal) values ('o1', '{"name":"王小明"}', 'pickup', '1', 'Cash', 'org', 100);`,
    );
    await subscribe('ticket', 'ko');
    await db.insert(pushSubscription).values({
      id: 'order',
      endpoint: 'https://push.example.com/order',
      p256dh: 'order-p256dh',
      auth: 'order-auth',
      lang: 'en',
      app: 'storefront',
      orderId: 'o1',
    });

    await serviceWith(VAPID).notify({ orderId: 'o1' }, { push: CALLED, email });

    expect(email).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ endpoint: 'https://push.example.com/order' }),
      expect.any(String),
      expect.any(Object),
    );
  });

  it('emails and never pushes while the VAPID keys are not set', async () => {
    await subscribe('a');

    await serviceWith({}).notify(
      { waitlistTicketId: 't1' },
      { push: CALLED, email },
    );

    expect(sendNotification).not.toHaveBeenCalled();
    expect(email).toHaveBeenCalledOnce();
  });

  it.each([404, 410])(
    'deletes a subscription the push service answers %i for and emails instead',
    async (statusCode) => {
      await subscribe('gone');
      sendNotification.mockRejectedValue(webPushError(statusCode));

      await serviceWith(VAPID).notify(
        { waitlistTicketId: 't1' },
        { push: CALLED, email },
      );

      expect(await subscriptionIds()).toEqual([]);
      expect(email).toHaveBeenCalledOnce();
    },
  );

  it('still emails when deleting a gone subscription fails', async () => {
    await subscribe('gone');
    sendNotification.mockRejectedValue(webPushError(410));
    const deleteSpy = vi.spyOn(db, 'delete').mockImplementationOnce(
      () =>
        ({
          where: () => Promise.reject(new Error('connection lost')),
        }) as never,
    );

    await serviceWith(VAPID).notify(
      { waitlistTicketId: 't1' },
      { push: CALLED, email },
    );

    expect(email).toHaveBeenCalledOnce();
    deleteSpy.mockRestore();
  });

  it('keeps a subscription that failed for another reason and emails when every push failed', async () => {
    await subscribe('a');
    await subscribe('b');
    sendNotification
      .mockRejectedValueOnce(webPushError(500))
      .mockRejectedValueOnce(new Error('Socket timeout'));

    await serviceWith(VAPID).notify(
      { waitlistTicketId: 't1' },
      { push: CALLED, email },
    );

    expect(await subscriptionIds()).toEqual(['a', 'b']);
    expect(email).toHaveBeenCalledOnce();
  });

  it('sends no email when one of the pushes is delivered', async () => {
    await subscribe('a');
    await subscribe('gone');
    sendNotification.mockImplementation(({ endpoint }: { endpoint: string }) =>
      endpoint.endsWith('/gone')
        ? Promise.reject(webPushError(410))
        : Promise.resolve({ statusCode: 201 }),
    );

    await serviceWith(VAPID).notify(
      { waitlistTicketId: 't1' },
      { push: CALLED, email },
    );

    expect(await subscriptionIds()).toEqual(['a']);
    expect(email).not.toHaveBeenCalled();
  });

  it('never connects to a push host without a public address and emails instead', async () => {
    await subscribe('a');
    vi.mocked(resolvePublicAddresses).mockResolvedValue(null);

    await serviceWith(VAPID).notify(
      { waitlistTicketId: 't1' },
      { push: CALLED, email },
    );

    expect(sendNotification).not.toHaveBeenCalled();
    expect(await subscriptionIds()).toEqual(['a']);
    expect(email).toHaveBeenCalledOnce();
  });

  it('without a push message sends nothing to a subscribed ticket and emails an unsubscribed one', async () => {
    await subscribe('a');

    await serviceWith(VAPID).notify(
      { waitlistTicketId: 't1' },
      { push: null, email },
    );
    expect(email).not.toHaveBeenCalled();

    await serviceWith(VAPID).notify(
      { waitlistTicketId: 't2' },
      { push: null, email },
    );
    expect(email).toHaveBeenCalledOnce();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('does nothing without a subscription or an email', async () => {
    await serviceWith(VAPID).notify(
      { waitlistTicketId: 't1' },
      { push: CALLED, email: null },
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe('push translations', () => {
  const placeholders = (text: string) => text.match(/\{\w+\}/g)?.sort();

  it.each(languagesEnum.enumValues)(
    '%s has the waitlist call with only the ticket number and store name',
    (language) => {
      const { waitlist_called } = JSON.parse(
        readFileSync(`src/i18n/${language}/push.json`, 'utf8'),
      ) as { waitlist_called: { title: string; body: string } };

      expect(placeholders(waitlist_called.title)).toEqual([
        '{organizationName}',
      ]);
      expect(placeholders(waitlist_called.body)).toEqual(['{ticketNumber}']);
    },
  );

  it.each(languagesEnum.enumValues)(
    '%s has the order pickup with only the order number and store name',
    (language) => {
      const { order_pickup_available } = JSON.parse(
        readFileSync(`src/i18n/${language}/push.json`, 'utf8'),
      ) as { order_pickup_available: { title: string; body: string } };

      expect(placeholders(order_pickup_available.title)).toEqual([
        '{organizationName}',
      ]);
      expect(placeholders(order_pickup_available.body)).toEqual([
        '{orderNumber}',
      ]);
    },
  );
});
