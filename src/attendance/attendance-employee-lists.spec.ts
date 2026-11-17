import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { AttendanceEmployeesService } from './attendance-employees.service.js';
import type { AttendanceEmployeePaginationQueryDto } from './dto/attendance-employee-pagination-query.dto.js';

describe('AttendanceEmployeesService employee and member lists', () => {
  const actor = { organizationId: 'store', userId: 'owner', role: 'owner' };

  let client: PGlite;
  let service: AttendanceEmployeesService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new AttendanceEmployeesService(db as unknown as DrizzleDB);

    await db.insert(schema.organization).values(
      ['store', 'other'].map((id) => ({
        id,
        name: id,
        slug: id,
        createdAt: new Date(),
        addressCountry: 'TW',
        addressLocality: '中正區',
        addressRegion: '臺北市',
        postalCode: '100',
        streetAddress: '忠孝西路一段 1 號',
      })),
    );
    const people = [
      { id: 'amy', organizationId: 'store', jobTitle: '咖啡師' },
      { id: 'ben', organizationId: 'store', jobTitle: '店長' },
      { id: 'cara', organizationId: 'store', jobTitle: null },
      { id: 'dan', organizationId: 'other', jobTitle: '咖啡師' },
    ];
    await db.insert(schema.user).values(
      people.map(({ id }) => ({
        id,
        name: id,
        firstName: id,
        email: `${id}@example.com`,
      })),
    );
    await db.insert(schema.member).values(
      people.map(({ id, organizationId }) => ({
        id: `member-${id}`,
        organizationId,
        userId: id,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })),
    );
    await db.insert(schema.attendanceEmployee).values(
      people
        .filter(({ jobTitle }) => jobTitle)
        .map(({ id, organizationId, jobTitle }) => ({
          id: `employee-${id}`,
          organizationId,
          userId: id,
          jobTitle,
          hiredAt: new Date('2026-01-01T00:00:00Z'),
        })),
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const names = async (
    list: 'employees' | 'members',
    query: AttendanceEmployeePaginationQueryDto,
  ) => {
    const { data, total } = await service[list](actor, query);
    return { names: data.map(({ name }) => name), total };
  };

  it('lists only the store’s employees, sorted and quick-filtered', async () => {
    expect(
      await names('employees', { sortBy: 'name', sortDirection: 'desc' }),
    ).toEqual({
      names: ['ben', 'amy'],
      total: 2,
    });
    expect(await names('employees', { quickFilterValue: '咖啡' })).toEqual({
      names: ['amy'],
      total: 1,
    });
  });

  it('lists every store member, employee or not, with the same filters', async () => {
    expect(
      await names('members', { sortBy: 'name', sortDirection: 'desc' }),
    ).toEqual({
      names: ['cara', 'ben', 'amy'],
      total: 3,
    });
    expect(
      await names('members', {
        filterField: 'jobTitle',
        filterOperator: 'contains',
        filterValue: '店長',
      }),
    ).toEqual({ names: ['ben'], total: 1 });
    expect(await names('members', { limit: 1, offset: 1 })).toEqual({
      names: ['ben'],
      total: 3,
    });
  });
});
