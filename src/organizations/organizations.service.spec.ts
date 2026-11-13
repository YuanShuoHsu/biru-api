import { ConflictException, ForbiddenException } from '@nestjs/common';

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nContext } from 'nestjs-i18n';

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
    service = new OrganizationsService(db);
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

  it('停權已過期的成員會出現在團隊介紹，期限未到的不會', async () => {
    await service.setMemberShowcase('biru', 'm-bob', true, bob);

    try {
      await client.exec(
        `update "user" set banned = true, ban_expires = now() - interval '1 day' where id = 'bob'`,
      );
      expect(
        (await service.organizationTeam('biru')).map(({ id }) => id),
      ).toContain('m-bob');

      await client.exec(
        `update "user" set ban_expires = now() + interval '1 day' where id = 'bob'`,
      );
      expect(
        (await service.organizationTeam('biru')).map(({ id }) => id),
      ).not.toContain('m-bob');
    } finally {
      await client.exec(
        `update "user" set banned = false, ban_expires = null where id = 'bob'`,
      );
      await service.setMemberShowcase('biru', 'm-bob', false, bob);
    }
  });

  it('找不到門市時回 404', async () => {
    await expect(service.organizationTeam('nope')).rejects.toMatchObject({
      response: { code: 'organizationNotFound' },
      status: 404,
    });
  });

  it('依現行 slug 或舊 slug 找到門市，找不到時回 null', async () => {
    await client.exec(`
      insert into organization_slug_history (id, slug, organization_id) values
        ('h1', 'old-biru', 'biru'),
        ('h2', 'other', 'biru');
    `);

    try {
      expect((await service.organizationBySlug('biru'))?.id).toBe('biru');
      expect((await service.organizationBySlug('old-biru'))?.id).toBe('biru');
      expect((await service.organizationBySlug('other'))?.id).toBe('other');
      expect(await service.organizationBySlug('nope')).toBeNull();
    } finally {
      await client.exec(
        "delete from organization_slug_history where id in ('h1', 'h2')",
      );
    }
  });

  it('門市列表預設不含停業門市，includeClosed 時全部列出，依建立時間排序', async () => {
    await client.exec(`
      update organization set created_at = '2026-01-02' where id = 'biru';
      update organization set created_at = '2026-01-01', closed_at = now() where id = 'other';
    `);

    try {
      expect((await service.organizations()).map(({ id }) => id)).toEqual([
        'biru',
      ]);
      expect((await service.organizations(true)).map(({ id }) => id)).toEqual([
        'other',
        'biru',
      ]);
    } finally {
      await client.exec(
        `update organization set created_at = now(), closed_at = null where id in ('biru', 'other')`,
      );
    }
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
    ).rejects.toMatchObject({
      response: { code: 'memberNotFound' },
      status: 404,
    });
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
    ).rejects.toMatchObject({ response: { code: 'forbidden' }, status: 403 });
  });

  it('以平台管理員身分加入的成員不能開啟公開顯示，也不會出現在團隊介紹', async () => {
    await client.exec(
      `update member set joined_as_platform_admin = true where id = 'm-cat'`,
    );
    try {
      await expect(
        service.setMemberShowcase('biru', 'm-cat', true, adminActor),
      ).rejects.toMatchObject({
        response: { code: 'showcaseJoinedAsPlatformAdmin' },
        status: 403,
      });

      await client.exec(`update member set showcase = true where id = 'm-cat'`);
      expect(
        await service.organizationMembers('biru', { showcasedOnly: true }),
      ).toEqual([]);
      await service.setMemberShowcase('biru', 'm-cat', false, adminActor);
    } finally {
      await client.exec(
        `update member set joined_as_platform_admin = false, showcase = false where id = 'm-cat'`,
      );
    }
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
    service = new OrganizationsService(pglite as unknown as DrizzleDB);
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

  it('列出本店身為平台管理員的成員，不論是否以平台管理員身分加入', async () => {
    await client.exec(`
      insert into member (id, organization_id, user_id, role, joined_as_platform_admin, created_at) values
        ('m-sue-biru', 'biru', 'sue', 'member', false, now());
    `);

    await expect(service.platformAdminMemberIds('biru')).resolves.toEqual(
      expect.arrayContaining(['m-root', 'm-sue-biru']),
    );
    await expect(service.platformAdminMemberIds('biru')).resolves.toHaveLength(
      2,
    );
    await expect(service.platformAdminMemberIds('other')).resolves.toEqual([
      'm-sue',
    ]);
  });

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
    ).rejects.toMatchObject({ response: { code: 'forbidden' }, status: 403 });
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
    await expect(
      service.confirmOwner('biru', 'm-sue', root),
    ).rejects.toMatchObject({
      response: { code: 'memberNotFound' },
      status: 404,
    });
  });
});

describe('OrganizationsService.setClosed', () => {
  let client: PGlite;
  let service: OrganizationsService;

  const openWork = (orders: number, unreconciledOrders: number) => ({
    response: {
      code: 'organizationHasOpenWork',
      message: expect.stringContaining(
        JSON.stringify({ orders, unreconciledOrders, tickets: 0 }),
      ),
    },
    status: 409,
  });

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    service = new OrganizationsService(pglite as unknown as DrizzleDB);
    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
        ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string, options?: { args?: unknown }) =>
        `${key}${JSON.stringify(options?.args)}`,
    } as unknown as I18nContext);
    await client.exec(`
      truncate "order" cascade;
      update organization set closed_at = null;
    `);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const insertOrder = (
    id: string,
    status: string,
    {
      reconciled = false,
      createdDaysAgo = 0,
      discountCode = null as string | null,
      sellerId = 'biru',
    } = {},
  ) =>
    client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, created_at, reconciled_at, discount_code)
       values ($1, '{}', 'pickup', $1, $2, 'Credit', $4, 100, now() - make_interval(days => $3), ${reconciled ? 'now()' : 'null'}, $5)`,
      [id, status, createdDaysAgo, sellerId, discountCode],
    );

  it('對帳期內還沒對帳的異常訂單會擋下停業，數量另外列出', async () => {
    await insertOrder('problem', 'OrderProblem');
    await insertOrder('processing', 'OrderProcessing');

    await expect(service.setClosed('biru', true)).rejects.toMatchObject(
      openWork(1, 1),
    );
  });

  it('已對帳、超過對帳期、帶優惠券或別家門市的異常訂單，以及已完成、已取消的訂單不擋停業', async () => {
    await insertOrder('reconciled', 'OrderProblem', { reconciled: true });
    await insertOrder('expired', 'OrderProblem', { createdDaysAgo: 8 });
    await insertOrder('with-coupon', 'OrderProblem', {
      discountCode: 'SAVE10',
    });
    await insertOrder('other-store', 'OrderProblem', { sellerId: 'other' });
    await insertOrder('delivered', 'OrderDelivered');
    await insertOrder('cancelled', 'OrderCancelled');

    await expect(service.setClosed('biru', true)).resolves.toMatchObject({
      closedAt: expect.any(Date),
    });
  });

  it('重新營業不檢查未完成的工作', async () => {
    await insertOrder('problem', 'OrderProblem');

    await expect(service.setClosed('biru', false)).resolves.toMatchObject({
      closedAt: null,
    });
  });
});

describe('OrganizationsService.upcomingSpecialHours', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let service: OrganizationsService;

  const day = (offset: number) =>
    platformDateString(new Date(Date.now() + offset * DAY_MS));

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;
    service = new OrganizationsService(db);
    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('biru', 'Biru', 'biru', '2026-01-01', 'TW', '桃園市', '大園區', '中正東路一段'),
        ('other', 'Other', 'other', '2026-01-02', 'TW', '桃園市', '大園區', '中正東路一段'),
        ('quiet', 'Quiet', 'quiet', '2026-01-03', 'TW', '桃園市', '大園區', '中正東路一段');
      insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours, note) values
        ('ended', 'biru', '${day(-4)}', '${day(-2)}', null, null),
        ('ongoing', 'biru', '${day(-1)}', '${day(0)}', null, '颱風停業'),
        ('last', 'biru', '${day(PICKUP_MAX_ADVANCE_DAYS)}', '${day(PICKUP_MAX_ADVANCE_DAYS + 2)}', 'Mo-Su 10:00-15:00', null),
        ('beyond', 'biru', '${day(PICKUP_MAX_ADVANCE_DAYS + 3)}', '${day(PICKUP_MAX_ADVANCE_DAYS + 3)}', null, null),
        ('other-ended', 'other', '${day(-3)}', '${day(-2)}', null, null),
        ('other-yesterday', 'other', '${day(-1)}', '${day(-1)}', null, null),
        ('other', 'other', '${day(1)}', '${day(1)}', null, null),
        ('other-day-after-last', 'other', '${day(PICKUP_MAX_ADVANCE_DAYS + 1)}', '${day(PICKUP_MAX_ADVANCE_DAYS + 1)}', null, null),
        ('other-beyond', 'other', '${day(PICKUP_MAX_ADVANCE_DAYS + 2)}', '${day(PICKUP_MAX_ADVANCE_DAYS + 2)}', null, null);
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('從昨天到可預約自取最遠日期的隔天，只回這家店的特殊營業日', async () => {
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

  it('列出昨天結束與最遠日期隔天開始的特殊營業日，前天結束與再隔一天開始的不列出', async () => {
    const specialHours = await service.upcomingSpecialHours('other');

    expect(specialHours.map(({ id }) => id)).toEqual([
      'other-yesterday',
      'other',
      'other-day-after-last',
    ]);
  });

  it('門市列表以一次查詢帶出各店的特殊營業日，沒有的店為空陣列', async () => {
    const findMany = vi.spyOn(db.query.organizationSpecialHours, 'findMany');

    try {
      const organizations = await service.organizations();

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(
        organizations.map(({ id, specialHours }) => [
          id,
          specialHours.map((row) => row.id),
        ]),
      ).toEqual([
        ['biru', ['ongoing', 'last']],
        ['other', ['other-yesterday', 'other', 'other-day-after-last']],
        ['quiet', []],
      ]);
      expect(organizations[0].specialHours[0]).toEqual({
        id: 'ongoing',
        note: '颱風停業',
        openingHours: null,
        validFrom: day(-1),
        validThrough: day(0),
      });
    } finally {
      findMany.mockRestore();
    }
  });

  it('沒有門市時不查特殊營業日', async () => {
    const findMany = vi.spyOn(db.query.organizationSpecialHours, 'findMany');
    await client.exec(
      `update organization set closed_at = now() where id in ('biru', 'other', 'quiet')`,
    );

    try {
      await expect(service.organizations()).resolves.toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    } finally {
      findMany.mockRestore();
      await client.exec(`update organization set closed_at = null`);
    }
  });
});

describe('organization.slug 唯一', () => {
  let client: PGlite;

  beforeAll(async () => {
    client = createPGlite();
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: './drizzle',
    });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('slug 不能重複', async () => {
    const insert = (id: string) =>
      client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, $1, 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
        [id],
      );

    await insert('first');

    await expect(insert('second')).rejects.toThrow(/organization_slug_unique/);
  });
});

describe('OrganizationsService 經營型態', () => {
  let client: PGlite;
  let service: OrganizationsService;
  let migrationsBefore: string;

  const insertOrganization = (id: string) =>
    client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('${id}', '${id}', '${id}', now(), 'TW', '桃園市', '大園區', '中正東路一段');
    `);

  beforeAll(async () => {
    migrationsBefore = await mkdtemp(join(tmpdir(), 'drizzle-'));
    await cp('./drizzle', migrationsBefore, { recursive: true });
    const journalPath = join(migrationsBefore, 'meta', '_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    journal.entries = journal.entries.filter(
      ({ tag }) => tag !== '0280_organization_operating_type',
    );
    await writeFile(journalPath, JSON.stringify(journal));

    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: migrationsBefore });
    await insertOrganization('existing');
    await migrate(pglite, { migrationsFolder: './drizzle' });
    await insertOrganization('created');
    service = new OrganizationsService(pglite as unknown as DrizzleDB);
  }, 120_000);

  afterAll(async () => {
    await client.close();
    await rm(migrationsBefore, { recursive: true, force: true });
  });

  it('既有門市在 migration 時設為直營，之後新建的門市為未分類', async () => {
    await expect(service.operatingType('existing')).resolves.toEqual({
      operatingType: 'direct',
    });
    await expect(service.operatingType('created')).resolves.toEqual({
      operatingType: 'unclassified',
    });
  });

  it('設定後只改到指定門市，再設定一次會覆寫', async () => {
    await service.setOperatingType('created', 'franchise');
    await service.setOperatingType('created', 'direct');

    await expect(service.operatingType('created')).resolves.toEqual({
      operatingType: 'direct',
    });
    await expect(service.operatingType('existing')).resolves.toEqual({
      operatingType: 'direct',
    });
  });

  it('經營型態不在公開的門市資料裡', async () => {
    const [found] = await service.organizations();

    expect(found).not.toHaveProperty('operatingType');
  });

  it('門市不存在時回 404', async () => {
    const notFound = {
      response: { code: 'organizationNotFound' },
      status: 404,
    };

    await expect(service.operatingType('missing')).rejects.toMatchObject(
      notFound,
    );
    await expect(
      service.setOperatingType('missing', 'direct'),
    ).rejects.toMatchObject(notFound);
  });
});
