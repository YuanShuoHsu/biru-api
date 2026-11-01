import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { AuditService } from './audit.service.js';

const createdAt = '2026-10-28 08:00:00';

const auditRow = {
  source: 'audit',
  id: 'audit-1',
  actorId: 'user-1',
  actorName: 'Owner',
  actorEmail: 'owner@example.com',
  organizationId: 'org-1',
  resource: 'order',
  resourceId: 'order-1',
  resourceLabel: 'A001',
  ancestorIds: [],
  action: 'update',
  changes: { status: { before: 'pending', after: 'ready' } },
  changeLabels: null,
  createdAt,
  targetEmployeeName: null,
};

const attendanceRow = {
  source: 'attendance',
  id: 'attendance-1',
  actorId: 'user-1',
  actorName: 'Owner',
  actorEmail: 'owner@example.com',
  organizationId: 'org-1',
  resource: 'shift',
  resourceId: 'shift-1',
  resourceLabel: null,
  ancestorIds: null,
  action: 'create',
  changes: { employeeId: 'employee-1', teamId: 'team-1', note: 'x' },
  changeLabels: null,
  createdAt,
  targetEmployeeName: 'Barista',
};

describe('AuditService.listAll', () => {
  it('labels the foreign keys of attendance entries only', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [auditRow, attendanceRow] })
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({
        rows: [
          { field: 'employeeId', id: 'employee-1', label: 'Barista' },
          { field: 'teamId', id: 'team-1', label: 'Bar' },
        ],
      });
    const service = new AuditService({ execute } as unknown as DrizzleDB);

    const { data, total } = await service.listAll();

    expect(total).toBe(2);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(data).toEqual([
      {
        id: 'audit-1',
        actorId: 'user-1',
        actorName: 'Owner',
        actorEmail: 'owner@example.com',
        organizationId: 'org-1',
        resource: 'order',
        resourceId: 'order-1',
        resourceLabel: 'A001',
        ancestorIds: [],
        action: 'update',
        changes: { status: { before: 'pending', after: 'ready' } },
        changeLabels: null,
        createdAt: new Date(createdAt),
      },
      {
        id: 'attendance-1',
        actorId: 'user-1',
        actorName: 'Owner',
        actorEmail: 'owner@example.com',
        organizationId: 'org-1',
        resource: 'shift',
        resourceId: 'shift-1',
        resourceLabel: 'Barista',
        ancestorIds: null,
        action: 'create',
        changes: {
          employeeId: { after: 'employee-1' },
          teamId: { after: 'team-1' },
          note: { after: 'x' },
        },
        changeLabels: {
          employeeId: { 'employee-1': 'Barista' },
          teamId: { 'team-1': 'Bar' },
        },
        createdAt: new Date(createdAt),
      },
    ]);
  });

  it('gives an attendance entry without foreign keys empty labels', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [auditRow, { ...attendanceRow, changes: { note: 'x' } }],
      })
      .mockResolvedValueOnce({ rows: [{ total: 2 }] });
    const service = new AuditService({ execute } as unknown as DrizzleDB);

    const { data } = await service.listAll();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(data.map(({ changeLabels }) => changeLabels)).toEqual([null, {}]);
    expect(Object.keys(data[1])).toEqual([
      'id',
      'actorId',
      'actorName',
      'actorEmail',
      'organizationId',
      'resource',
      'resourceId',
      'resourceLabel',
      'ancestorIds',
      'action',
      'changes',
      'changeLabels',
      'createdAt',
    ]);
  });

  it('skips the label query when no entry has a foreign key', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [auditRow] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const service = new AuditService({ execute } as unknown as DrizzleDB);

    const { data } = await service.listAll();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(data[0]).toMatchObject({ id: 'audit-1', changeLabels: null });
  });
});

describe('AuditService.listForOrganization paging', () => {
  let client: PGlite;
  let service: AuditService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new AuditService(db as unknown as DrizzleDB);

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org', '碧露', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "user" (id, name, first_name, email, lang) values ('owner', 'Owner', 'Owner', 'owner@example.com', 'zh-TW');
       insert into audit_log (id, actor_id, actor_name, actor_email, organization_id, resource, resource_id, action, changes, created_at)
         select 'audit-' || n, 'owner', 'Owner', 'owner@example.com', 'org', 'order', 'order-' || n, 'update', '{}', '2026-10-28 08:00:00'
         from generate_series(1, 12) n;
       insert into attendance_audit (id, organization_id, actor_id, action, resource_id, changes, created_at)
         select 'attendance-' || n, 'org', 'owner', 'employee.update', 'employee-' || n, '{}', '2026-10-28 08:00:00+00'
         from generate_series(1, 12) n;`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it.each([
    {},
    { sortBy: 'actorName', sortDirection: 'asc' },
    { sortBy: 'action', sortDirection: 'desc' },
  ] as const)(
    'returns every entry written in one transaction exactly once across pages (%o)',
    async (sort) => {
      const ids: string[] = [];
      for (let offset = 0; offset < 24; offset += 5) {
        const { data, total } = await service.listForOrganization(
          'org',
          'owner',
          { ...sort, limit: 5, offset },
        );
        expect(total).toBe(24);
        ids.push(...data.map(({ id }) => id));
      }

      expect(ids).toHaveLength(24);
      expect(new Set(ids).size).toBe(24);
    },
  );
});

describe('AuditService.listForOrganization search', () => {
  let client: PGlite;
  let service: AuditService;

  const ids = async (
    role: string,
    query: Parameters<AuditService['listForOrganization']>[2],
  ) => {
    const { data, total } = await service.listForOrganization(
      'org',
      role,
      query,
    );
    expect(total).toBe(data.length);
    return data.map(({ id }) => id).sort();
  };

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new AuditService(db as unknown as DrizzleDB);

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org', '碧露', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "user" (id, name, first_name, email, lang) values
         ('owner', 'Owner', 'Owner', 'owner@example.com', 'zh-TW'),
         ('manager', 'Manager', 'Manager', 'manager@example.com', 'zh-TW'),
         ('barista', 'Wang Xiaoming', 'Xiaoming', 'barista@example.com', 'zh-TW');
       insert into attendance_employee (id, organization_id, user_id, hired_at) values ('employee-wang', 'org', 'barista', '2026-01-01');
       insert into audit_log (id, actor_id, actor_name, actor_email, organization_id, resource, resource_id, resource_label, action, changes, created_at) values
         ('menu-latte', 'owner', 'Owner', 'owner@example.com', 'org', 'menuItem', 'item-1', '{"zh-TW": "拿鐵", "ja": "ラテ", "en": "Caffe Latte"}', 'update', '{}', '2026-10-28 08:00:00'),
         ('member-wang', 'owner', 'Owner', 'owner@example.com', 'org', 'member', 'member-1', '"Wang Xiaoming"', 'create', '{}', '2026-10-28 08:00:00'),
         ('order-label', 'manager', 'Manager', 'manager@example.com', 'org', 'order', 'order-1', '"A001"', 'update', '{}', '2026-10-28 08:00:00');
       insert into attendance_audit (id, organization_id, actor_id, action, resource_id, changes, created_at) values
         ('att-employee', 'org', 'owner', 'employee.update', 'employee-wang', '{}', '2026-10-28 08:00:00+00'),
         ('att-shift', 'org', 'manager', 'shift.create', 'shift-1', '{"employeeId": "employee-wang"}', '2026-10-28 08:00:00+00'),
         ('att-leave-type', 'org', 'manager', 'leaveType.update', 'leave-type-1', '{}', '2026-10-28 08:00:00+00');`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it.each(['ラテ', 'latte', '拿鐵'])(
    'finds a menu item by its localized name (%s)',
    async (quickFilterValue) => {
      expect(await ids('owner', { quickFilterValue })).toEqual(['menu-latte']);
    },
  );

  it('finds an entry by a plain string label', async () => {
    expect(await ids('owner', { quickFilterValue: 'a001' })).toEqual([
      'order-label',
    ]);
  });

  it('finds attendance entries by the target employee name', async () => {
    expect(await ids('owner', { quickFilterValue: 'xiaoming' })).toEqual([
      'att-employee',
      'att-shift',
      'member-wang',
    ]);
  });

  it('keeps entries the member cannot read out of the search but finds the ones they can', async () => {
    expect(await ids('member', { quickFilterValue: 'xiaoming' })).toEqual([
      'member-wang',
    ]);
  });

  it('filters by actor across both sources', async () => {
    expect(await ids('owner', { actorId: 'manager' })).toEqual([
      'att-leave-type',
      'att-shift',
      'order-label',
    ]);
    expect(await ids('member', { actorId: 'manager' })).toEqual([
      'att-leave-type',
      'order-label',
    ]);
  });

  it('still labels attendance entries with the target employee name', async () => {
    const { data, total } = await service.listForOrganization('org', 'owner');

    expect(total).toBe(6);
    expect(
      Object.fromEntries(
        data.map(({ id, resourceLabel }) => [id, resourceLabel]),
      ),
    ).toEqual({
      'menu-latte': { 'zh-TW': '拿鐵', ja: 'ラテ', en: 'Caffe Latte' },
      'order-label': 'A001',
      'member-wang': 'Wang Xiaoming',
      'att-employee': 'Wang Xiaoming',
      'att-shift': 'Wang Xiaoming',
      'att-leave-type': null,
    });
  });
});

describe('AuditService.listAll sorting', () => {
  let client: PGlite;
  let service: AuditService;

  const ids = async (
    sortBy: 'organizationId' | 'actorEmail',
    sortDirection: 'asc' | 'desc',
  ) => {
    const { data } = await service.listAll({ sortBy, sortDirection });
    return data.map(({ id }) => id);
  };

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new AuditService(db as unknown as DrizzleDB);

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('z-org', 'Alpha', 'alpha', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('a-org', 'Beta', 'beta', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into audit_log (id, actor_id, actor_name, actor_email, organization_id, resource, resource_id, action, changes, created_at) values
         ('alpha', null, 'Owner', 'b@example.com', 'z-org', 'order', 'order-1', 'update', '{}', '2026-10-28 08:00:00'),
         ('beta', null, 'Owner', 'c@example.com', 'a-org', 'order', 'order-2', 'update', '{}', '2026-10-28 08:01:00'),
         ('platform', null, 'Admin', 'a@example.com', null, 'banner', 'banner-1', 'update', '{}', '2026-10-28 08:02:00');`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('sorts organizations by name rather than id', async () => {
    expect(await ids('organizationId', 'asc')).toEqual([
      'alpha',
      'beta',
      'platform',
    ]);
    expect(await ids('organizationId', 'desc')).toEqual([
      'platform',
      'beta',
      'alpha',
    ]);
  });

  it('sorts by actor email', async () => {
    expect(await ids('actorEmail', 'asc')).toEqual([
      'platform',
      'alpha',
      'beta',
    ]);
  });
});
