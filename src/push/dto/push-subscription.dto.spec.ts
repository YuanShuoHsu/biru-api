import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreatePushSubscriptionDto } from './push-subscription.dto.js';

const errorsOf = async (body: object) =>
  (
    await validate(plainToInstance(CreatePushSubscriptionDto, body), {
      forbidNonWhitelisted: true,
      whitelist: true,
    })
  ).map(({ property }) => property);

const BROWSER_JSON = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc:APA91bE',
  expirationTime: null,
  keys: { p256dh: 'BNc', auth: 'tBH' },
};

describe('CreatePushSubscriptionDto', () => {
  it('accepts the keys of PushSubscription.toJSON() with an app', async () => {
    const { endpoint, keys } = BROWSER_JSON;
    expect(await errorsOf({ endpoint, keys, app: 'storefront' })).toEqual([]);
  });

  it.each([
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB',
    'https://web.push.apple.com/QGuQyavXutnMH',
    'https://db5p.notify.windows.com/w/?token=BQYAAAB%2b',
  ])('accepts the endpoint %s', async (endpoint) => {
    const { keys } = BROWSER_JSON;
    expect(await errorsOf({ endpoint, keys, app: 'storefront' })).toEqual([]);
  });

  it('rejects a non-https endpoint and missing keys', async () => {
    expect(
      await errorsOf({ endpoint: 'http://push.example.com/x', app: 'admin' }),
    ).toEqual(expect.arrayContaining(['endpoint', 'keys']));
  });

  it.each([
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.1/push',
    'https://[::1]/push',
    'https://[::ffff:127.0.0.1]/push',
    'https://[fe80::1%25eth0]/push',
    'https://push.example.com:6379/push',
    'https://localhost/push',
    'https://user:pass@push.example.com/push',
  ])('rejects the endpoint %s', async (endpoint) => {
    const { keys } = BROWSER_JSON;
    expect(await errorsOf({ endpoint, keys, app: 'storefront' })).toEqual([
      'endpoint',
    ]);
  });

  it('requires the store and the ticket together', async () => {
    const { endpoint, keys } = BROWSER_JSON;
    expect(
      await errorsOf({
        endpoint,
        keys,
        app: 'storefront',
        waitlistTicketId: 't1',
      }),
    ).toEqual(['organizationSlug']);
    expect(
      await errorsOf({
        endpoint,
        keys,
        app: 'storefront',
        organizationSlug: 'biru',
      }),
    ).toEqual(['waitlistTicketId']);
  });

  it.each([
    [
      { organizationSlug: '', waitlistTicketId: '' },
      ['organizationSlug', 'waitlistTicketId'],
    ],
    [{ orderId: '' }, ['orderId']],
    [
      { orderId: 'o1', organizationSlug: 'biru', waitlistTicketId: 't1' },
      ['waitlistTicketId'],
    ],
  ])('rejects %o', async (target, properties) => {
    const { endpoint, keys } = BROWSER_JSON;
    expect(
      await errorsOf({ endpoint, keys, app: 'storefront', ...target }),
    ).toEqual(properties);
  });
});
