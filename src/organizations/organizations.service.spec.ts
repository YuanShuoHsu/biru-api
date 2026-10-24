import { NotFoundException } from '@nestjs/common';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { resolveAuditLabels } from '../common/utils/audit-resources.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { OrganizationsService } from './organizations.service.js';

describe('OrganizationsService 團隊介紹', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let service: OrganizationsService;

  beforeAll(async () => {
    client = new PGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;
    service = new OrganizationsService(db);
    await client.exec(`
      insert into organization (id, name, slug, created_at) values
        ('biru', 'Biru', 'biru', now()),
        ('other', 'Other', 'other', now());
      insert into "user" (id, name, email, first_name, last_name, bio) values
        ('amy', 'amy', 'amy@example.com', 'Amy', 'Lin', '咖啡師'),
        ('bob', 'bob', 'bob@example.com', 'Bob', null, null);
      insert into team (id, name, organization_id, created_at) values
        ('bar', '吧台', 'biru', now()),
        ('other-bar', '別店吧台', 'other', now());
      insert into team_member (id, team_id, user_id) values
        ('tm1', 'bar', 'amy'),
        ('tm2', 'other-bar', 'amy');
      insert into member (id, organization_id, user_id, role, created_at) values
        ('m-amy', 'biru', 'amy', 'owner', '2026-01-01'),
        ('m-bob', 'biru', 'bob', 'member', '2026-01-02'),
        ('m-other', 'other', 'amy', 'member', '2026-01-01');
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('update member set showcase = false');
  });

  it('新成員預設不公開，只有設定公開的成員會出現在團隊介紹', async () => {
    expect(
      await service.organizationMembers('biru', { showcasedOnly: true }),
    ).toEqual([]);

    await service.setMemberShowcase('biru', 'm-amy', true);

    expect(
      await service.organizationMembers('biru', { showcasedOnly: true }),
    ).toEqual([
      expect.objectContaining({
        firstName: 'Amy',
        id: 'm-amy',
        role: 'owner',
        showcase: true,
        teams: [{ id: 'bar', name: '吧台' }],
      }),
    ]);
    expect(
      await service.organizationMembers('other', { showcasedOnly: true }),
    ).toEqual([]);
  });

  it('公開的團隊介紹只帶公開欄位，不含停權帳號與停業門市', async () => {
    await service.setMemberShowcase('biru', 'm-amy', true);
    await service.setMemberShowcase('biru', 'm-bob', true);
    await client.exec(`update "user" set banned = true where id = 'bob'`);

    try {
      expect(await service.organizationTeam('biru')).toEqual([
        {
          bio: '咖啡師',
          firstName: 'Amy',
          id: 'm-amy',
          image: null,
          lastName: 'Lin',
          role: 'owner',
          teams: [{ id: 'bar', name: '吧台' }],
        },
      ]);

      await client.exec(
        `update organization set closed_at = now() where id = 'biru'`,
      );
      expect(await service.organizationTeam('biru')).toEqual([]);
    } finally {
      await client.exec(`
        update "user" set banned = false where id = 'bob';
        update organization set closed_at = null where id = 'biru';
      `);
    }
  });

  it('找不到門市時回 404', async () => {
    await expect(service.organizationTeam('nope')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('不帶 showcasedOnly 時列出全部成員，依加入時間排序', async () => {
    await service.setMemberShowcase('biru', 'm-bob', true);

    expect(
      (await service.organizationMembers('biru')).map(({ id, showcase }) => ({
        id,
        showcase,
      })),
    ).toEqual([
      { id: 'm-amy', showcase: false },
      { id: 'm-bob', showcase: true },
    ]);
  });

  it('不能設定其他門市的成員', async () => {
    await expect(
      service.setMemberShowcase('biru', 'm-other', true),
    ).rejects.toThrow(NotFoundException);
    expect(
      await service.organizationMembers('other', { showcasedOnly: true }),
    ).toEqual([]);
  });

  it('成員異動紀錄以成員的名稱作為標籤', async () => {
    const labels = await resolveAuditLabels(
      db,
      'member',
      new Map([['m-amy', undefined]]),
    );

    expect(labels.get('m-amy')).toEqual({
      resourceLabel: 'amy',
      ancestorIds: [],
    });
  });
});
