import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import type { Transaction } from '../attendance/attendance-audit.js';
import * as schema from '../db/schema/index.js';

import { runInAuthTransaction } from './auth-transaction.js';
import { cancelExpiredInvitations } from './expired-invitations.js';

const HOUR_MS = 60 * 60 * 1000;

describe('cancelExpiredInvitations', () => {
  let client: PGlite;
  let db: Transaction;

  beforeAll(async () => {
    client = new PGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as Transaction;
    await client.exec(`
      insert into "user" (id, name, email, first_name) values ('owner', 'owner', 'owner@example.com', 'owner');
      insert into organization (id, name, slug, created_at) values
        ('biru', 'Biru', 'biru', now()),
        ('other', 'Other', 'other', now());
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate invitation');
  });

  const invite = (
    id: string,
    organizationId: string,
    email: string,
    expiresInMs: number,
    status = 'pending',
  ) =>
    client.query(
      `insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id)
       values ($1, $2, $3, 'member', $4, $5, 'owner')`,
      [id, organizationId, email, status, new Date(Date.now() + expiresInMs)],
    );

  const statuses = async () =>
    (
      await client.query<{ id: string; status: string }>(
        'select id, status from invitation order by id',
      )
    ).rows;

  it('只取消同門市、同 email（不分大小寫）且已過期的 pending 邀請', async () => {
    await invite('expired', 'biru', 'Amy@Example.com', -HOUR_MS);
    await invite('accepted', 'biru', 'amy@example.com', -HOUR_MS, 'accepted');
    await invite('other-email', 'biru', 'bob@example.com', -HOUR_MS);
    await invite('other-store', 'other', 'amy@example.com', -HOUR_MS);

    await runInAuthTransaction(db, () =>
      cancelExpiredInvitations('biru', 'amy@example.com'),
    );

    expect(await statuses()).toEqual([
      { id: 'accepted', status: 'accepted' },
      { id: 'expired', status: 'canceled' },
      { id: 'other-email', status: 'pending' },
      { id: 'other-store', status: 'pending' },
    ]);
  });

  it('到期時間剛好等於現在就視為已過期，和 better-auth 判斷有效的 expiresAt > now 互補', async () => {
    const now = new Date('2026-10-24T08:00:00Z');
    await invite('edge', 'biru', 'amy@example.com', now.getTime() - Date.now());
    vi.useFakeTimers({ now, toFake: ['Date'] });

    try {
      await runInAuthTransaction(db, () =>
        cancelExpiredInvitations('biru', 'amy@example.com'),
      );
    } finally {
      vi.useRealTimers();
    }

    expect(await statuses()).toEqual([{ id: 'edge', status: 'canceled' }]);
  });

  it('未過期的 pending 邀請留給 better-auth 的重邀流程處理', async () => {
    await invite('pending', 'biru', 'amy@example.com', HOUR_MS);

    await runInAuthTransaction(db, () =>
      cancelExpiredInvitations('biru', 'amy@example.com'),
    );

    expect(await statuses()).toEqual([{ id: 'pending', status: 'pending' }]);
  });

  it('取消後同一個 email 可以再建立一筆 pending 邀請', async () => {
    await invite('expired', 'biru', 'amy@example.com', -HOUR_MS);

    await runInAuthTransaction(db, () =>
      cancelExpiredInvitations('biru', 'amy@example.com'),
    );

    await expect(
      invite('again', 'biru', 'amy@example.com', HOUR_MS),
    ).resolves.toBeDefined();
  });
});
