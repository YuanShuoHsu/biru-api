import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { MailsService } from '../mails/mails.service.js';

import { WaitlistNotificationsService } from './waitlist-notifications.service.js';

describe('WaitlistNotificationsService.onUpdated', () => {
  let client: PGlite;
  let service: WaitlistNotificationsService;
  const sendWaitlistNotification = vi.fn();

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new WaitlistNotificationsService(
      db as unknown as DrizzleDB,
      { sendWaitlistNotification } as unknown as MailsService,
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
});
