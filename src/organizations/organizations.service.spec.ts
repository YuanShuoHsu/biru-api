import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { PICKUP_MAX_ADVANCE_DAYS } from '../common/constants/pickup.js';
import { DAY_MS, platformDateString } from '../common/constants/timezone.js';
import { resolveAuditLabels } from '../common/utils/audit-resources.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { OrganizationsService } from './organizations.service.js';

describe('OrganizationsService 團隊介紹', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let service: OrganizationsService;

  const owner = { role: 'owner', userId: 'amy' };
  const bob = { role: 'member', userId: 'bob' };
  const adminActor = { role: 'admin', userId: 'cat' };

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;
    service = new OrganizationsService(db, {
      t: (key: string) => key,
    } as never);
    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
        ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');
      insert into "user" (id, name, email, first_name, last_name, bio) values
        ('amy', 'amy', 'amy@example.com', 'Amy', 'Lin', '咖啡師'),
        ('bob', 'bob', 'bob@example.com', 'Bob', null, null),
        ('cat', 'cat', 'cat@example.com', 'Cat', null, null);
      insert into team (id, name, organization_id, created_at) values
        ('bar', '吧台', 'biru', now()),
        ('other-bar', '別店吧台', 'other', now());
      insert into team_member (id, team_id, user_id) values
        ('tm1', 'bar', 'amy'),
        ('tm2', 'other-bar', 'amy');
      insert into member (id, organization_id, user_id, role, created_at) values
        ('m-amy', 'biru', 'amy', 'owner', '2026-01-01'),
        ('m-bob', 'biru', 'bob', 'member', '2026-01-02'),
        ('m-cat', 'biru', 'cat', 'admin', '2026-01-03'),
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

    await service.setMemberShowcase('biru', 'm-amy', true, owner);

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
    await service.setMemberShowcase('biru', 'm-amy', true, owner);
    await service.setMemberShowcase('biru', 'm-bob', true, bob);
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
    await service.setMemberShowcase('biru', 'm-bob', true, bob);

    expect(
      (await service.organizationMembers('biru')).map(({ id, showcase }) => ({
        id,
        showcase,
      })),
    ).toEqual([
      { id: 'm-amy', showcase: false },
      { id: 'm-bob', showcase: true },
      { id: 'm-cat', showcase: false },
    ]);
  });

  it('不能設定其他門市的成員', async () => {
    await expect(
      service.setMemberShowcase('biru', 'm-other', true, owner),
    ).rejects.toThrow(NotFoundException);
    expect(
      await service.organizationMembers('other', { showcasedOnly: true }),
    ).toEqual([]);
  });

  it('成員本人可以開啟與關閉自己的公開顯示', async () => {
    await service.setMemberShowcase('biru', 'm-bob', true, bob);
    expect(
      await service.organizationMembers('biru', { showcasedOnly: true }),
    ).toEqual([expect.objectContaining({ id: 'm-bob', showcase: true })]);

    await service.setMemberShowcase('biru', 'm-bob', false, bob);
    expect(
      await service.organizationMembers('biru', { showcasedOnly: true }),
    ).toEqual([]);
  });

  it('owner／admin 不能替其他成員開啟公開顯示', async () => {
    await expect(
      service.setMemberShowcase('biru', 'm-bob', true, owner),
    ).rejects.toThrow(ForbiddenException);
    expect(
      await service.organizationMembers('biru', { showcasedOnly: true }),
    ).toEqual([]);
  });

  it('owner／admin 可以替其他成員關閉公開顯示', async () => {
    await service.setMemberShowcase('biru', 'm-bob', true, bob);
    await service.setMemberShowcase('biru', 'm-bob', false, owner);
    expect(
      await service.organizationMembers('biru', { showcasedOnly: true }),
    ).toEqual([]);
  });

  it('admin 也不能替其他成員開啟、但可以關閉', async () => {
    await expect(
      service.setMemberShowcase('biru', 'm-bob', true, adminActor),
    ).rejects.toThrow(ForbiddenException);

    await service.setMemberShowcase('biru', 'm-bob', true, bob);
    await service.setMemberShowcase('biru', 'm-bob', false, adminActor);
    expect(
      await service.organizationMembers('biru', { showcasedOnly: true }),
    ).toEqual([]);
  });

  it('一般成員不能更動其他成員的公開顯示', async () => {
    await expect(
      service.setMemberShowcase('biru', 'm-amy', false, bob),
    ).rejects.toThrow(ForbiddenException);
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

describe('OrganizationsService 轉為真正店主', () => {
  let client: PGlite;
  let service: OrganizationsService;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    service = new OrganizationsService(
      pglite as unknown as DrizzleDB,
      {
        t: (key: string) => key,
      } as never,
    );
    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
        ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');
      insert into "user" (id, name, email, first_name) values
        ('amy', 'amy', 'amy@example.com', 'Amy'),
        ('cat', 'cat', 'cat@example.com', 'Cat'),
        ('root', 'root', 'root@example.com', 'Root'),
        ('sue', 'sue', 'sue@example.com', 'Sue');
      update "user" set role = 'admin' where id in ('root', 'sue');
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(`
      truncate member;
      insert into member (id, organization_id, user_id, role, joined_as_platform_admin, created_at) values
        ('m-amy', 'biru', 'amy', 'owner', false, now()),
        ('m-cat', 'biru', 'cat', 'admin', false, now()),
        ('m-root', 'biru', 'root', 'owner', true, now()),
        ('m-sue', 'other', 'sue', 'owner', true, now());
    `);
  });

  const flagOf = async (id: string) =>
    (
      await client.query<{ joined_as_platform_admin: boolean }>(
        'select joined_as_platform_admin from member where id = $1',
        [id],
      )
    ).rows[0]?.joined_as_platform_admin;

  it('真正的店主可以把以平台管理員身分加入的成員轉為真正店主', async () => {
    await expect(
      service.confirmOwner('biru', 'm-root', {
        platformAdmin: false,
        userId: 'amy',
      }),
    ).resolves.toMatchObject({
      id: 'm-root',
      joinedAsPlatformAdmin: false,
      role: 'owner',
    });
    expect(await flagOf('m-root')).toBe(false);
  });

  it('平台管理員不是該店成員也可以轉正', async () => {
    await service.confirmOwner('other', 'm-sue', {
      platformAdmin: true,
      userId: 'root',
    });

    expect(await flagOf('m-sue')).toBe(false);
  });

  it('以平台管理員身分加入的 owner 失去平台角色後不能替自己轉正', async () => {
    await expect(
      service.confirmOwner('biru', 'm-root', {
        platformAdmin: false,
        userId: 'root',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(await flagOf('m-root')).toBe(true);
  });

  it('店內管理員與非成員都不能轉正', async () => {
    await expect(
      service.confirmOwner('biru', 'm-root', {
        platformAdmin: false,
        userId: 'cat',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.confirmOwner('other', 'm-sue', {
        platformAdmin: false,
        userId: 'amy',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(await flagOf('m-root')).toBe(true);
    expect(await flagOf('m-sue')).toBe(true);
  });

  it('對象不是以平台管理員身分加入的 owner 時回 409，別店成員回 404', async () => {
    const root = { platformAdmin: true, userId: 'root' };

    await expect(service.confirmOwner('biru', 'm-amy', root)).rejects.toThrow(
      ConflictException,
    );
    await expect(service.confirmOwner('biru', 'm-cat', root)).rejects.toThrow(
      ConflictException,
    );
    await expect(service.confirmOwner('biru', 'm-sue', root)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('OrganizationsService.upcomingSpecialHours', () => {
  let client: PGlite;
  let service: OrganizationsService;

  const day = (offset: number) =>
    platformDateString(new Date(Date.now() + offset * DAY_MS));

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    service = new OrganizationsService(
      pglite as unknown as DrizzleDB,
      { t: (key: string) => key } as never,
    );
    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
        ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');
      insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours, note) values
        ('ended', 'biru', '${day(-4)}', '${day(-2)}', null, null),
        ('ongoing', 'biru', '${day(-1)}', '${day(0)}', null, '颱風停業'),
        ('last', 'biru', '${day(PICKUP_MAX_ADVANCE_DAYS)}', '${day(PICKUP_MAX_ADVANCE_DAYS + 2)}', 'Mo-Su 10:00-15:00', null),
        ('beyond', 'biru', '${day(PICKUP_MAX_ADVANCE_DAYS + 3)}', '${day(PICKUP_MAX_ADVANCE_DAYS + 3)}', null, null),
        ('other', 'other', '${day(1)}', '${day(1)}', null, null);
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('從今天到可預約自取的最遠日期，只回這家店的特殊營業日', async () => {
    await expect(service.upcomingSpecialHours('biru')).resolves.toEqual([
      {
        id: 'ongoing',
        note: '颱風停業',
        openingHours: null,
        validFrom: day(-1),
        validThrough: day(0),
      },
      {
        id: 'last',
        note: null,
        openingHours: 'Mo-Su 10:00-15:00',
        validFrom: day(PICKUP_MAX_ADVANCE_DAYS),
        validThrough: day(PICKUP_MAX_ADVANCE_DAYS + 2),
      },
    ]);
  });
});
