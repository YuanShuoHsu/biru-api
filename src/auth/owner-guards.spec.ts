import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import type { Transaction } from '../attendance/attendance-audit.js';
import * as schema from '../db/schema/index.js';

import { runInAuthTransaction } from './auth-transaction.js';
import { assertUserDeletable } from './deletion-guards.js';
import { assertKeepsOwner, assertMayManageMember } from './owner-guards.js';

describe('assertKeepsOwner', () => {
  let client: PGlite;
  let db: Transaction;

  beforeAll(async () => {
    client = new PGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as Transaction;
    await client.exec(`
      insert into "user" (id, name, email, first_name) values
        ('amy', 'amy', 'amy@example.com', 'amy'),
        ('ben', 'ben', 'ben@example.com', 'ben'),
        ('root', 'root', 'root@example.com', 'root');
      update "user" set role = 'admin' where id = 'root';
      insert into organization (id, name, slug, created_at) values ('biru', 'Biru', 'biru', now());
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate member');
  });

  const join = (
    id: string,
    userId: string,
    role: 'owner' | 'admin' | 'member',
    joinedAsPlatformAdmin = false,
  ) =>
    client.query(
      `insert into member (id, organization_id, user_id, role, joined_as_platform_admin, created_at)
       values ($1, 'biru', $2, $3, $4, now())`,
      [id, userId, role, joinedAsPlatformAdmin],
    );

  const keeps = (memberId: string) =>
    runInAuthTransaction(db, () => assertKeepsOwner(memberId));

  it('擋下唯一的店主，即使還有以平台管理員身分加入的 owner', async () => {
    await join('m-amy', 'amy', 'owner');
    await join('m-root', 'root', 'owner', true);

    await expect(keeps('m-amy')).rejects.toMatchObject({
      body: { code: 'ORGANIZATION_REQUIRES_AN_OWNER' },
    });
  });

  it('還有另一位店主時放行', async () => {
    await join('m-amy', 'amy', 'owner');
    await join('m-ben', 'ben', 'owner');

    await expect(keeps('m-amy')).resolves.toBeUndefined();
  });

  it('以平台管理員身分加入的 owner 與一般成員都可以離開或被移除', async () => {
    await join('m-amy', 'amy', 'owner');
    await join('m-ben', 'ben', 'member');
    await join('m-root', 'root', 'owner', true);

    await expect(keeps('m-root')).resolves.toBeUndefined();
    await expect(keeps('m-ben')).resolves.toBeUndefined();
  });

  it('刪帳號時不把以平台管理員身分加入的 owner 當成另一位店主', async () => {
    await join('m-amy', 'amy', 'owner');
    await join('m-root', 'root', 'owner', true);

    await expect(
      runInAuthTransaction(db, () => assertUserDeletable('amy')),
    ).rejects.toMatchObject({
      body: { code: 'USER_IS_SOLE_ORGANIZATION_OWNER' },
    });
    await expect(
      runInAuthTransaction(db, () => assertUserDeletable('root')),
    ).resolves.toBeUndefined();
  });

  it('只有平台管理員能移除或改動平台管理員成員', async () => {
    await join('m-amy', 'amy', 'owner');
    await join('m-root', 'root', 'owner', true);

    const manage = (actorRole: string, target: string) =>
      runInAuthTransaction(db, () =>
        assertMayManageMember(actorRole, target, 'biru'),
      );

    for (const target of ['m-root', 'root@example.com'])
      await expect(manage('user', target)).rejects.toMatchObject({
        body: { code: 'PLATFORM_ADMIN_MEMBER_PROTECTED' },
      });
    await expect(manage('admin', 'm-root')).resolves.toBeUndefined();
    await expect(manage('user', 'm-amy')).resolves.toBeUndefined();
  });
});
