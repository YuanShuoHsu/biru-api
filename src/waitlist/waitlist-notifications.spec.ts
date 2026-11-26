import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { MailsService } from '../mails/mails.service.js';
import type { NotificationsService } from '../push/notifications.service.js';

import { WaitlistNotificationsService } from './waitlist-notifications.service.js';

describe('WaitlistNotificationsService.onUpdated', () => {
  let client: PGlite;
  let service: WaitlistNotificationsService;
  const sendWaitlistNotification = vi.fn();
  const notify = vi.fn<NotificationsService['notify']>(
    async (_recipient, { email }) => email?.(),
  );

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new WaitlistNotificationsService(
      db as unknown as DrizzleDB,
      { sendWaitlistNotification } as unknown as MailsService,
      { notify } as unknown as NotificationsService,
    );
    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
      insert into "user" (id, name, first_name, email, lang, email_verified) values ('amy', 'Amy', 'Amy', 'amy@example.com', 'ja', true), ('bob', 'Bob', 'Bob', 'bob@example.com', 'ko', true), ('eve', 'Eve', 'Eve', 'taken@example.com', 'ja', false);
      insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status, email, user_id)
        values ('member', 'org', '2026-11-19', 'A', 1, 2, 'zh-TW', 'waiting', 'Amy@Example.com', 'amy'),
               ('guest', 'org', '2026-11-19', 'A', 2, 2, 'en', 'waiting', 'guest@example.com', null),
               ('companion', 'org', '2026-11-19', 'A', 3, 2, 'zh-CN', 'waiting', 'friend@example.com', 'amy'),
               ('staff', 'org', '2026-11-19', 'A', 4, 2, 'zh-TW', 'waiting', 'Bob@Example.com', null),
               ('unverified', 'org', '2026-11-19', 'A', 5, 2, 'ko', 'waiting', 'taken@example.com', null);
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    sendWaitlistNotification.mockReset();
    notify.mockClear();
  });

  it('會員的取號用會員的語言寄信，不用取號時的頁面語言', async () => {
    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'member', status: 'waiting' },
    });

    expect(sendWaitlistNotification).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'Amy@Example.com', lang: 'ja' }),
    );
  });

  it('email 不是任何會員的取號用取號時的語言寄信', async () => {
    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'guest', status: 'waiting' },
    });

    expect(sendWaitlistNotification).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'guest@example.com', lang: 'en' }),
    );
  });

  it('會員替非會員的同行者取號時用取號時的語言寄信', async () => {
    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'companion', status: 'waiting' },
    });

    expect(sendWaitlistNotification).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'friend@example.com', lang: 'zh-CN' }),
    );
  });

  it('店員代客登記時，email 是會員的就用該會員的語言寄信', async () => {
    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'staff', status: 'waiting' },
    });

    expect(sendWaitlistNotification).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'Bob@Example.com', lang: 'ko' }),
    );
  });

  it('email 對應的帳號沒驗證時用取號時的語言寄信', async () => {
    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'unverified', status: 'waiting' },
    });

    expect(sendWaitlistNotification).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'taken@example.com', lang: 'ko' }),
    );
  });

  it('因特殊營業日公休取消的號碼寄取消信並附上公休說明，客人自己取消的不寄', async () => {
    await client.exec(`
      insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours, note)
        values ('closed', 'org', '2026-11-19', '2026-11-19', null, '颱風停業');
      insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status, email, cancel_reason)
        values ('closed', 'org', '2026-11-19', 'A', 6, 2, 'en', 'cancelled', 'closed@example.com', 'storeClosed'),
               ('left', 'org', '2026-11-19', 'A', 7, 2, 'en', 'cancelled', 'left@example.com', null);
    `);

    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'left', status: 'cancelled' },
    });
    expect(sendWaitlistNotification).not.toHaveBeenCalled();

    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'closed', status: 'cancelled' },
    });
    expect(notify).not.toHaveBeenCalled();
    expect(sendWaitlistNotification).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        email: 'closed@example.com',
        kind: 'cancelled',
        note: '颱風停業',
        ticketNumber: 'A006',
      }),
    );
  });

  it('叫號交給通知服務推播號碼與門市名稱，沒有訂閱時才寄叫號信', async () => {
    await client.exec(`
      insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status, email, called_at)
        values ('called', 'org', '2026-11-19', 'A', 8, 2, 'en', 'called', 'called@example.com', now());
    `);

    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'called', status: 'called' },
    });

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      { waitlistTicketId: 'called' },
      {
        push: {
          title: 'push.waitlist_called.title',
          body: 'push.waitlist_called.body',
          args: { organizationName: 'Biru', ticketNumber: 'A008' },
          path: '/waitlist/biru/called',
          ttlSeconds: 10 * 60,
        },
        email: expect.any(Function),
      },
    );
    expect(sendWaitlistNotification).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ email: 'called@example.com', kind: 'called' }),
    );
  });

  it('取號只在沒有訂閱時寄確認信，不推播', async () => {
    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'guest', status: 'waiting' },
    });

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      { waitlistTicketId: 'guest' },
      { push: null, email: expect.any(Function) },
    );
  });

  it('沒留 email 的號碼仍交給通知服務推播叫號，但店休取消不寄也不推', async () => {
    await client.exec(`
      insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status, called_at, cancel_reason)
        values ('no-email', 'org', '2026-11-19', 'A', 9, 2, 'en', 'called', now(), null),
               ('no-email-closed', 'org', '2026-11-19', 'A', 10, 2, 'en', 'cancelled', null, 'storeClosed');
    `);

    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'no-email', status: 'called' },
    });
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      { waitlistTicketId: 'no-email' },
      expect.objectContaining({
        push: expect.objectContaining({ path: '/waitlist/biru/no-email' }),
        email: null,
      }),
    );

    notify.mockClear();
    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'no-email-closed', status: 'cancelled' },
    });
    expect(notify).not.toHaveBeenCalled();
    expect(sendWaitlistNotification).not.toHaveBeenCalled();
  });
});
