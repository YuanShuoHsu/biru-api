import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import type { AttendanceActor } from './attendance-actor.js';
import { AttendanceEmployeesService } from './attendance-employees.service.js';
import { AttendanceLeavesService } from './attendance-leaves.service.js';
import type { SaveAttendanceEmployeeDto } from './dto/save-attendance-employee.dto.js';

const ORG = 'org';
const actor: AttendanceActor = {
  organizationId: ORG,
  userId: 'owner',
  role: 'owner',
};

describe('turning holiday shifts back into workdays', () => {
  let client: PGlite;
  let employees: AttendanceEmployeesService;
  let leaves: AttendanceLeavesService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema }) as unknown as DrizzleDB;
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: './drizzle',
    });
    employees = new AttendanceEmployeesService(db);
    leaves = new AttendanceLeavesService(db);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      'truncate attendance_holiday_substitute, attendance_shift, attendance_employee, statutory_holiday, member, organization, "user" cascade',
    );
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('${ORG}', '碧露', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "user" (id, name, first_name, email, lang) values ('owner', 'Owner', 'Owner', 'owner@example.com', 'zh-TW'), ('amy', 'Amy', 'Amy', 'amy@example.com', 'zh-TW');
       insert into member (id, organization_id, user_id, role, created_at) values ('m-owner', '${ORG}', 'owner', 'owner', now()), ('m-amy', '${ORG}', 'amy', 'member', now());
       insert into attendance_employee (id, organization_id, user_id, birth_date, hired_at, indigenous_holidays)
         values ('emp', '${ORG}', 'amy', '1990-01-01', '2026-01-01T00:00:00+08:00', '["2026-03-10", "2026-03-12"]');
       insert into attendance_shift (id, organization_id, employee_id, starts_at, ends_at, day_kind) values
         ('indigenous-only', '${ORG}', 'emp', '2026-03-10T09:00:00+08:00', '2026-03-10T13:00:00+08:00', 'holiday'),
         ('substituted', '${ORG}', 'emp', '2026-03-12T09:00:00+08:00', '2026-03-12T13:00:00+08:00', 'holiday'),
         ('substitute-only', '${ORG}', 'emp', '2026-03-17T09:00:00+08:00', '2026-03-17T13:00:00+08:00', 'holiday');
       insert into attendance_holiday_substitute (id, organization_id, employee_id, holiday_date, shift_id, created_by) values
         ('sub-indigenous', '${ORG}', 'emp', '2026-02-28', 'substituted', 'owner'),
         ('sub-plain', '${ORG}', 'emp', '2026-02-27', 'substitute-only', 'owner');`,
    );
  });

  const dayKinds = async () =>
    Object.fromEntries(
      (
        await client.query<{ id: string; day_kind: string }>(
          'select id, day_kind from attendance_shift order by id',
        )
      ).rows.map(({ id, day_kind }) => [id, day_kind]),
    );

  const employeeDto = (
    indigenousHolidays: string[],
  ): SaveAttendanceEmployeeDto => ({
    userId: 'amy',
    birthDate: '1990-01-01',
    legalStatus: 'national',
    studentVacations: [],
    workPermits: [],
    pregnancyPeriods: [],
    nursingPeriods: [],
    childcareReductionPeriods: [],
    indigenousHolidays,
    hiredAt: '2026-01-01T00:00:00+08:00',
  });

  it('removing an indigenous holiday keeps a 補休 on that date a holiday', async () => {
    await employees.saveEmployee(actor, employeeDto([]));

    expect(await dayKinds()).toEqual({
      'indigenous-only': 'workday',
      substituted: 'holiday',
      'substitute-only': 'holiday',
    });
  });

  it('removing an indigenous holiday keeps a statutory holiday on that date a holiday', async () => {
    await client.exec(
      `insert into statutory_holiday (date, name) values ('2026-03-10', '補假')`,
    );

    await employees.saveEmployee(actor, employeeDto(['2026-03-12']));

    expect((await dayKinds())['indigenous-only']).toBe('holiday');
  });

  it('deleting a 補休 keeps an indigenous holiday on that date a holiday', async () => {
    await leaves.deleteHolidaySubstitutes(actor, ['sub-indigenous']);

    expect((await dayKinds()).substituted).toBe('holiday');
  });

  it('deleting a 補休 on an ordinary date turns its shift back into a workday', async () => {
    await leaves.deleteHolidaySubstitutes(actor, ['sub-plain']);

    expect((await dayKinds())['substitute-only']).toBe('workday');
  });
});
