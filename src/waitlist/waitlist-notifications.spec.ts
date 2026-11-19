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
      insert into "user" (id, name, first_name, email, lang) values ('amy', 'Amy', 'Amy', 'amy@example.com', 'ja');
      insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status, email, user_id)
        values ('member', 'org', '2026-11-19', 'A', 1, 2, 'zh-TW', 'waiting', 'amy@example.com', 'amy'),
               ('guest', 'org', '2026-11-19', 'A', 2, 2, 'ko', 'waiting', 'guest@example.com', null);
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
      expect.objectContaining({ email: 'amy@example.com', lang: 'ja' }),
    );
  });

  it('沒有會員的取號用取號時的語言寄信', async () => {
    await service.onUpdated({
      organizationId: 'org',
      ticket: { id: 'guest', status: 'waiting' },
    });

    expect(sendWaitlistNotification).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'guest@example.com', lang: 'ko' }),
    );
  });
});
