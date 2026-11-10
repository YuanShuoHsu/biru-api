import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { banner } from '../db/schema/banners.js';
import { deletedRecord } from '../db/schema/deleted-records.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { DeletedRecordsService } from './deleted-records.service.js';

describe('DeletedRecordsService.restore', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: DeletedRecordsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new DeletedRecordsService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emit: vi.fn() } as unknown as EventEmitter2,
      {} as never,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('還原 commit 後才失敗的異動紀錄不會讓請求失敗', async () => {
    await db.insert(banner).values({ id: 'b1', image: 'banner' });
    await db.delete(banner);
    const [{ batchId }] = await db.select().from(deletedRecord);
    vi.spyOn(
      service as unknown as { resolveOrganizationId: () => Promise<never> },
      'resolveOrganizationId',
    ).mockRejectedValue(new Error('lookup failed'));

    await expect(
      service.restore([batchId], {
        id: 'admin',
        name: 'admin',
        email: 'admin@example.com',
      }),
    ).resolves.toBeUndefined();
    expect(await db.select({ id: banner.id }).from(banner)).toEqual([
      { id: 'b1' },
    ]);
  });

  it('不符合目前必填規則的門市無法還原，回 409 而不是 500', async () => {
    await db.insert(deletedRecord).values({
      batchId: 99,
      tableName: 'organization',
      recordId: 'old',
      data: {
        id: 'old',
        name: '舊門市',
        slug: 'old',
        created_at: '2026-01-01T00:00:00',
      },
    });

    await expect(
      service.restore([99], {
        id: 'admin',
        name: 'admin',
        email: 'admin@example.com',
      }),
    ).rejects.toMatchObject({
      response: { code: 'restoreInvalid', error: 'Conflict' },
      status: 409,
    });
  });
  it('平台管理員經由服務還原時以 owner 身分操作', async () => {
    const createShiftType = vi.fn();
    const serviceRestored = new DeletedRecordsService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      { createShiftType } as never,
      { emit: vi.fn() } as unknown as EventEmitter2,
      {} as never,
    );
    await db.insert(deletedRecord).values({
      batchId: 100,
      tableName: 'attendance_shift_type',
      recordId: 'st1',
      data: {
        id: 'st1',
        organization_id: 'org1',
        name: '早班',
        start_time: '08:00',
        end_time: '16:00',
      },
    });

    await serviceRestored.restore([100], {
      id: 'admin',
      name: 'admin',
      email: 'admin@example.com',
    });

    expect(createShiftType).toHaveBeenCalledWith(
      { organizationId: 'org1', userId: 'admin', role: 'owner' },
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('DeletedRecordsService.list', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: DeletedRecordsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new DeletedRecordsService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as EventEmitter2,
      {} as never,
    );
    await db.insert(deletedRecord).values([
      {
        batchId: 1,
        tableName: 'menu_item',
        recordId: 'i1',
        data: { name: { 'zh-TW': '拿鐵', en: 'Latte' } },
        deletedAt: new Date('2026-10-01T02:00:00Z'),
      },
      {
        batchId: 2,
        tableName: 'supplier',
        recordId: 's1',
        data: { name: '北區豆商', organization_id: 'org1' },
        deletedAt: new Date('2026-10-01T17:00:00Z'),
      },
      {
        batchId: 3,
        tableName: 'supplier',
        recordId: 's2',
        data: { name: '南區豆商', organization_id: 'org2' },
        deletedAt: new Date('2026-10-03T02:00:00Z'),
      },
      {
        batchId: 4,
        tableName: 'organization',
        recordId: 'org3',
        data: { name: '信義門市', slug: 'xinyi' },
        deletedAt: new Date('2026-09-30T02:00:00Z'),
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const ids = (result: { data: { batchId: number }[] }) =>
    result.data.map(({ batchId }) => batchId);

  it('快速搜尋比對多語名稱', async () => {
    const result = await service.list({ quickFilterValue: '拿鐵' });

    expect(ids(result)).toEqual([1]);
    expect(result.total).toBe(1);
  });

  it('快速搜尋不比對多語名稱的語言代碼', async () => {
    const result = await service.list({ quickFilterValue: 'zh-TW' });

    expect(ids(result)).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('快速搜尋比對純文字名稱', async () => {
    const result = await service.list({ quickFilterValue: '北區' });

    expect(ids(result)).toEqual([2]);
  });

  it('依資料類型篩選並依刪除時間排序', async () => {
    const result = await service.list({
      filterField: 'tableName',
      filterOperator: 'is',
      filterValue: 'supplier',
      sortBy: 'deletedAt',
      sortDirection: 'asc',
    });

    expect(ids(result)).toEqual([2, 3]);
    expect(result.total).toBe(2);
  });

  it('依台北日期篩選刪除時間', async () => {
    const result = await service.list({
      filterField: 'deletedAt',
      filterOperator: 'is',
      filterValue: '2026-10-02',
    });

    expect(ids(result)).toEqual([2]);
  });

  it('依組織名稱篩選時涵蓋被刪除的門市本身', async () => {
    const result = await service.list({
      filterField: 'organizationName',
      filterOperator: 'contains',
      filterValue: '信義',
    });

    expect(result.data).toMatchObject([
      { batchId: 4, organizationName: '信義門市' },
    ]);
  });

  it('店家視角的篩選只在本店資料內生效', async () => {
    const result = await service.list(
      {
        filterField: 'tableName',
        filterOperator: 'is',
        filterValue: 'supplier',
      },
      { organizationId: 'org1', role: 'owner', closed: false },
    );

    expect(ids(result)).toEqual([2]);
    expect(result.total).toBe(1);
  });

  it('店家視角標出不能還原的原因', async () => {
    await db.insert(deletedRecord).values({
      batchId: 5,
      tableName: 'member',
      recordId: 'm1',
      data: { id: 'm1', organization_id: 'org1', user_id: 'u1', role: 'owner' },
      deletedAt: new Date('2026-10-04T02:00:00Z'),
    });
    const reasons = async (role: string, closed: boolean) =>
      Object.fromEntries(
        (
          await service.list({}, { organizationId: 'org1', role, closed })
        ).data.map(({ batchId, canRestore, restoreBlockedBy }) => [
          batchId,
          { canRestore, restoreBlockedBy },
        ]),
      );

    expect(await reasons('owner', false)).toEqual({
      2: { canRestore: true, restoreBlockedBy: null },
      5: { canRestore: true, restoreBlockedBy: null },
    });
    expect(await reasons('admin', false)).toMatchObject({
      2: { canRestore: true, restoreBlockedBy: null },
      5: { canRestore: false, restoreBlockedBy: 'ownerOnly' },
    });
    expect(await reasons('owner', true)).toMatchObject({
      2: { canRestore: false, restoreBlockedBy: 'closed' },
    });
  });

  it('店家視角還原被擋下時回 403 forbidden', async () => {
    await db.insert(deletedRecord).values({
      batchId: 5,
      tableName: 'member',
      recordId: 'm1',
      data: { id: 'm1', organization_id: 'org1', user_id: 'u1', role: 'owner' },
      deletedAt: new Date('2026-10-04T02:00:00Z'),
    });

    await expect(
      service.restore(
        [5],
        { id: 'admin', name: 'admin', email: 'admin@example.com' },
        { organizationId: 'org1', role: 'admin', closed: false },
      ),
    ).rejects.toMatchObject({ response: { code: 'forbidden' }, status: 403 });
  });

  it('平台視角一律可以還原', async () => {
    const result = await service.list({});

    expect(result.data.every(({ restoreBlockedBy }) => !restoreBlockedBy)).toBe(
      true,
    );
  });
});

describe('DeletedRecordsService 還原平台管理員身分加入的成員', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: DeletedRecordsService;

  const actor = { id: 'admin', name: 'admin', email: 'admin@example.com' };
  const ownerScope = { organizationId: 'store', role: 'owner', closed: false };

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new DeletedRecordsService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emit: vi.fn() } as unknown as EventEmitter2,
      {} as never,
    );
    await db.insert(schema.user).values(
      (['revoked', 'stillAdmin', 'staff'] as const).map((id) => ({
        id,
        name: id,
        email: `${id}@example.com`,
        firstName: id,
        role: id === 'stillAdmin' ? ('admin' as const) : ('user' as const),
      })),
    );
    await db.insert(schema.organization).values({
      id: 'store',
      name: 'Biru',
      slug: 'biru',
      createdAt: new Date(),
      addressCountry: 'TW',
      addressLocality: '中正區',
      addressRegion: '臺北市',
      postalCode: '100',
      streetAddress: '忠孝西路一段 1 號',
    });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const deleteMember = async (
    userId: string,
    role: 'owner' | 'member',
    joinedAsPlatformAdmin: boolean,
  ) => {
    const id = uuidv4();
    await db.insert(schema.member).values({
      id,
      organizationId: 'store',
      userId,
      role,
      joinedAsPlatformAdmin,
      createdAt: new Date(),
    });
    await db.delete(schema.member).where(eq(schema.member.id, id));
    const [{ batchId }] = await db
      .select({ batchId: deletedRecord.batchId })
      .from(deletedRecord)
      .where(eq(deletedRecord.recordId, id));

    return batchId;
  };

  const restoredMember = (userId: string) =>
    db.query.member.findFirst({
      where: eq(schema.member.userId, userId),
      columns: { role: true, joinedAsPlatformAdmin: true },
    });

  const blockedBy = async (batchId: number, scope?: typeof ownerScope) =>
    (await service.list({}, scope)).data.find((row) => row.batchId === batchId);

  it('店家擁有者不能還原已撤銷平台管理員的擁有者成員', async () => {
    const batchId = await deleteMember('revoked', 'owner', true);

    expect(await blockedBy(batchId, ownerScope)).toMatchObject({
      canRestore: false,
      restoreBlockedBy: 'revokedPlatformAdmin',
    });
    await expect(
      service.restore([batchId], actor, ownerScope),
    ).rejects.toMatchObject({
      response: { code: 'restoreRevokedPlatformAdmin', error: 'Conflict' },
      status: 409,
    });
    expect(await restoredMember('revoked')).toBeUndefined();
  });

  it('平台視角也不能還原已撤銷平台管理員的擁有者成員', async () => {
    const batchId = await deleteMember('revoked', 'owner', true);

    expect(await blockedBy(batchId)).toMatchObject({
      canRestore: false,
      restoreBlockedBy: 'revokedPlatformAdmin',
    });
    await expect(service.restore([batchId], actor)).rejects.toMatchObject({
      response: { code: 'restoreRevokedPlatformAdmin' },
      status: 409,
    });
    expect(await restoredMember('revoked')).toBeUndefined();
  });

  it('仍是平台管理員時可以還原', async () => {
    const batchId = await deleteMember('stillAdmin', 'owner', true);

    expect(await blockedBy(batchId, ownerScope)).toMatchObject({
      canRestore: true,
      restoreBlockedBy: null,
    });
    await service.restore([batchId], actor, ownerScope);

    expect(await restoredMember('stillAdmin')).toEqual({
      role: 'owner',
      joinedAsPlatformAdmin: true,
    });
  });

  it('一般成員照常還原', async () => {
    const batchId = await deleteMember('staff', 'member', false);

    await service.restore([batchId], actor, ownerScope);

    expect(await restoredMember('staff')).toEqual({
      role: 'member',
      joinedAsPlatformAdmin: false,
    });
  });

  const deleteStore = async (platformAdminId: string) => {
    const id = uuidv4();
    await db.insert(schema.organization).values({
      id,
      name: '信義門市',
      slug: id,
      createdAt: new Date(),
      addressCountry: 'TW',
      addressLocality: '信義區',
      addressRegion: '臺北市',
      postalCode: '110',
      streetAddress: '市府路 1 號',
    });
    await db.insert(schema.member).values(
      [
        { userId: platformAdminId, role: 'owner' as const, flagged: true },
        { userId: 'staff', role: 'member' as const, flagged: false },
      ].map(({ userId, role, flagged }) => ({
        id: uuidv4(),
        organizationId: id,
        userId,
        role,
        joinedAsPlatformAdmin: flagged,
        createdAt: new Date(),
      })),
    );
    await db
      .insert(schema.team)
      .values({ id, name: '外場', organizationId: id, createdAt: new Date() });
    await db.insert(schema.teamMember).values(
      [platformAdminId, 'staff'].map((userId) => ({
        id: uuidv4(),
        teamId: id,
        userId,
      })),
    );
    await db.delete(schema.organization).where(eq(schema.organization.id, id));
    const [{ batchId }] = await db
      .select({ batchId: deletedRecord.batchId })
      .from(deletedRecord)
      .where(eq(deletedRecord.recordId, id));

    return { id, batchId };
  };

  const storeRows = async (id: string) => ({
    organization: (
      await db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.id, id))
    ).length,
    members: (
      await db.query.member.findMany({
        where: eq(schema.member.organizationId, id),
        columns: { userId: true },
      })
    )
      .map(({ userId }) => userId)
      .toSorted(),
    teamMembers: (
      await db.query.teamMember.findMany({
        where: eq(schema.teamMember.teamId, id),
        columns: { userId: true },
      })
    )
      .map(({ userId }) => userId)
      .toSorted(),
  });

  it('門市批次含已撤銷平台管理員的成員時照常還原，但不還原該成員與其團隊成員', async () => {
    const { id, batchId } = await deleteStore('revoked');

    expect(await blockedBy(batchId)).toMatchObject({
      tableName: 'organization',
      relatedCount: 3,
      canRestore: true,
      restoreBlockedBy: null,
    });
    await service.restore([batchId], actor);

    expect(await storeRows(id)).toEqual({
      organization: 1,
      members: ['staff'],
      teamMembers: ['staff'],
    });
    expect(
      await db
        .select()
        .from(deletedRecord)
        .where(eq(deletedRecord.batchId, batchId)),
    ).toEqual([]);
  });

  it('門市批次內的平台管理員仍是平台管理員時一併還原', async () => {
    const { id, batchId } = await deleteStore('stillAdmin');

    await service.restore([batchId], actor);

    expect(await storeRows(id)).toEqual({
      organization: 1,
      members: ['staff', 'stillAdmin'],
      teamMembers: ['staff', 'stillAdmin'],
    });
  });

  const createStore = async (organizationId: string) => {
    const teamId = uuidv4();
    await db.insert(schema.organization).values({
      id: organizationId,
      name: '大安門市',
      slug: organizationId,
      createdAt: new Date(),
      addressCountry: 'TW',
      addressLocality: '大安區',
      addressRegion: '臺北市',
      postalCode: '106',
      streetAddress: '復興南路 1 號',
    });
    await db.insert(schema.team).values({
      id: teamId,
      name: '吧台',
      organizationId,
      createdAt: new Date(),
    });

    return teamId;
  };

  it('刪除的使用者還原時不還原其平台管理員身分加入的成員與該店的團隊成員，其他門市照常還原', async () => {
    const userId = uuidv4();
    const flaggedStore = uuidv4();
    const otherStore = uuidv4();
    const [flaggedTeam, otherTeam] = [
      await createStore(flaggedStore),
      await createStore(otherStore),
    ];
    await db.insert(schema.user).values({
      id: userId,
      name: 'former',
      email: `${userId}@example.com`,
      firstName: 'former',
      role: 'user',
    });
    await db.insert(schema.member).values(
      [
        { organizationId: flaggedStore, role: 'owner' as const, flagged: true },
        { organizationId: otherStore, role: 'member' as const, flagged: false },
      ].map(({ organizationId, role, flagged }) => ({
        id: uuidv4(),
        organizationId,
        userId,
        role,
        joinedAsPlatformAdmin: flagged,
        createdAt: new Date(),
      })),
    );
    await db.insert(schema.teamMember).values(
      [flaggedTeam, otherTeam].map((teamId) => ({
        id: uuidv4(),
        teamId,
        userId,
      })),
    );
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    const [{ batchId }] = await db
      .select({ batchId: deletedRecord.batchId })
      .from(deletedRecord)
      .where(eq(deletedRecord.recordId, userId));

    expect(await blockedBy(batchId)).toMatchObject({
      tableName: 'user',
      relatedCount: 2,
      canRestore: true,
      restoreBlockedBy: null,
    });
    await service.restore([batchId], actor);

    expect(
      await db.query.user.findFirst({
        where: eq(schema.user.id, userId),
        columns: { role: true },
      }),
    ).toEqual({ role: 'user' });
    expect(
      await db.query.member.findMany({
        where: eq(schema.member.userId, userId),
        columns: { organizationId: true },
      }),
    ).toEqual([{ organizationId: otherStore }]);
    expect(
      await db.query.teamMember.findMany({
        where: eq(schema.teamMember.userId, userId),
        columns: { teamId: true },
      }),
    ).toEqual([{ teamId: otherTeam }]);
  });

  it('批次根為已撤銷平台管理員的團隊成員且其成員同在批次時回 409', async () => {
    const teamId = await createStore(uuidv4());
    const [{ organizationId }] = await db
      .select({ organizationId: schema.team.organizationId })
      .from(schema.team)
      .where(eq(schema.team.id, teamId));
    const {
      rows: [{ batchId }],
    } = await db.execute<{ batchId: number }>(
      sql`SELECT (-nextval('deleted_record_batch_seq'))::int AS "batchId"`,
    );
    await db.insert(deletedRecord).values([
      {
        batchId,
        tableName: 'team_member',
        recordId: 'tm-revoked',
        data: { id: 'tm-revoked', team_id: teamId, user_id: 'revoked' },
      },
      {
        batchId,
        tableName: 'member',
        recordId: 'm-revoked',
        data: {
          id: 'm-revoked',
          organization_id: organizationId,
          user_id: 'revoked',
          role: 'owner',
          joined_as_platform_admin: true,
          created_at: '2026-01-01T00:00:00',
        },
      },
    ]);

    expect(await blockedBy(batchId)).toMatchObject({
      tableName: 'team_member',
      canRestore: false,
      restoreBlockedBy: 'revokedPlatformAdmin',
    });
    await expect(service.restore([batchId], actor)).rejects.toMatchObject({
      response: { code: 'restoreRevokedPlatformAdmin' },
      status: 409,
    });
  });
});
