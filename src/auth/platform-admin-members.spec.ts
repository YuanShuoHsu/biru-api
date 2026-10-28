import { HttpException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { PGlite } from '@electric-sql/pglite';
import { createPGlite } from '../../test/pglite.js';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import type { Transaction } from '../attendance/attendance-audit.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { OrganizationPlatformAdminController } from '../organizations/organization-platform-admin.controller.js';

import { AuthBatchService } from './auth-batch.service.js';
import { createAuthI18n } from './i18n.js';
import { createAuth } from './index.js';
import { runInAuthTransaction } from './auth-transaction.js';
import { removeRevokedPlatformAdminMemberships } from './platform-admin-members.js';

describe('以平台管理員身分加入門市', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let service: AuthBatchService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema }) as unknown as DrizzleDB;
    await migrate(db as never, { migrationsFolder: './drizzle' });
    const auth = createAuth(
      {} as never,
      {} as never,
      createAuthI18n({ t: () => ({}) } as never),
    );
    service = new AuthBatchService(db, { instance: auth } as never);
    await client.exec(`
      insert into "user" (id, name, email, first_name, role) values
        ('amy', 'amy', 'amy@example.com', 'amy', 'user'),
        ('root', 'root', 'root@example.com', 'root', 'admin');
      insert into organization (id, name, slug, created_at) values ('biru', 'Biru', 'biru', now());
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(`
      truncate member;
      insert into member (id, organization_id, user_id, role, created_at) values
        ('m-amy', 'biru', 'amy', 'owner', now());
    `);
  });

  it('只有平台管理員能呼叫加入端點', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        Object.getOwnPropertyDescriptor(
          OrganizationPlatformAdminController.prototype,
          'join',
        )?.value as object,
      ),
    ).toEqual([AdminGuard]);
  });

  it('加入後角色是 owner，並標記為以平台管理員身分加入', async () => {
    await expect(
      service.addPlatformAdminMember({}, 'biru', 'root'),
    ).resolves.toMatchObject({
      organizationId: 'biru',
      userId: 'root',
      role: 'owner',
      joinedAsPlatformAdmin: true,
    });
  });

  it('已經是成員時沿用外掛的錯誤，且不改動原本的成員資格', async () => {
    await service.addPlatformAdminMember({}, 'biru', 'root');

    await expect(
      service.addPlatformAdminMember({}, 'biru', 'root'),
    ).rejects.toMatchObject({
      response: { code: 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION' },
    });
    await expect(
      service.addPlatformAdminMember({}, 'biru', 'amy'),
    ).rejects.toThrow(HttpException);

    const { rows } = await client.query(
      'select user_id, role, joined_as_platform_admin from member order by user_id',
    );
    expect(rows).toEqual([
      { user_id: 'amy', role: 'owner', joined_as_platform_admin: false },
      { user_id: 'root', role: 'owner', joined_as_platform_admin: true },
    ]);
  });
});

describe('removeRevokedPlatformAdminMemberships', () => {
  let client: PGlite;
  let db: Transaction;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as Transaction;
    await client.exec(`
      insert into "user" (id, name, email, first_name, role) values
        ('amy', 'amy', 'amy@example.com', 'amy', 'user'),
        ('root', 'root', 'root@example.com', 'root', 'admin');
      insert into organization (id, name, slug, created_at) values
        ('biru', 'Biru', 'biru', now()),
        ('cafe', 'Cafe', 'cafe', now()),
        ('own', 'Own', 'own', now());
      insert into team (id, name, organization_id, created_at) values
        ('biru-bar', 'bar', 'biru', now()),
        ('own-bar', 'bar', 'own', now());
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(`
      truncate member, team_member, deleted_record;
      update "user" set role = 'admin' where id = 'root';
      insert into member (id, organization_id, user_id, role, joined_as_platform_admin, created_at) values
        ('m-amy', 'biru', 'amy', 'owner', false, now()),
        ('m-root-biru', 'biru', 'root', 'owner', true, now()),
        ('m-root-cafe', 'cafe', 'root', 'owner', true, now()),
        ('m-root-own', 'own', 'root', 'owner', false, now());
      insert into team_member (id, team_id, user_id) values
        ('tm-amy', 'biru-bar', 'amy'),
        ('tm-root-biru', 'biru-bar', 'root'),
        ('tm-root-own', 'own-bar', 'root');
    `);
  });

  const remove = (userId: string) =>
    runInAuthTransaction(db, () =>
      removeRevokedPlatformAdminMemberships(userId),
    );

  const ids = async (table: 'member' | 'team_member') =>
    (
      await client.query<{ id: string }>(`select id from ${table} order by id`)
    ).rows.map(({ id }) => id);

  it('仍是平台管理員時不動任何成員資格', async () => {
    await expect(remove('root')).resolves.toEqual([]);
    expect(await ids('member')).toHaveLength(4);
  });

  it('拔除角色後只刪以平台管理員身分加入的成員資格與該店小組', async () => {
    await client.exec(`update "user" set role = 'user' where id = 'root'`);

    const removed = await remove('root');

    expect(removed.map(({ id }) => id).sort()).toEqual([
      'm-root-biru',
      'm-root-cafe',
    ]);
    expect(await ids('member')).toEqual(['m-amy', 'm-root-own']);
    expect(await ids('team_member')).toEqual(['tm-amy', 'tm-root-own']);

    const { rows } = await client.query<{ table_name: string }>(
      `select distinct on (batch_id) table_name from deleted_record order by batch_id, id`,
    );
    expect(rows).toEqual([{ table_name: 'member' }, { table_name: 'member' }]);
  });

  it('一般使用者沒有標記的成員資格時什麼都不刪', async () => {
    await expect(remove('amy')).resolves.toEqual([]);
    expect(await ids('member')).toHaveLength(4);
  });
});
