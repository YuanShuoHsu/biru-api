import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import type { AttendanceActor } from './attendance-actor.js';
import { AttendanceEmployeesService } from './attendance-employees.service.js';
import { AttendanceLeavesService } from './attendance-leaves.service.js';
import { AttendanceShiftsService } from './attendance-shifts.service.js';
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
  let shifts: AttendanceShiftsService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    employees = new AttendanceEmployeesService(db as unknown as DrizzleDB);
    leaves = new AttendanceLeavesService(db as unknown as DrizzleDB);
    shifts = new AttendanceShiftsService(db as unknown as DrizzleDB);
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
       insert into statutory_holiday (date, name) values ('2026-01-01', '開國紀念日');
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

    expect(await dayKinds()).toEqual({
      'indigenous-only': 'holiday',
      substituted: 'holiday',
      'substitute-only': 'holiday',
    });
  });

  it('deleting a 補休 keeps an indigenous holiday added to that date afterwards a holiday', async () => {
    await leaves.deleteHolidaySubstitutes(actor, ['sub-indigenous']);

    expect(await dayKinds()).toEqual({
      'indigenous-only': 'holiday',
      substituted: 'holiday',
      'substitute-only': 'holiday',
    });
  });

  it('deleting a 補休 on an ordinary date turns its shift back into a workday', async () => {
    await leaves.deleteHolidaySubstitutes(actor, ['sub-plain']);

    expect(await dayKinds()).toEqual({
      'indigenous-only': 'holiday',
      substituted: 'holiday',
      'substitute-only': 'workday',
    });
  });

  it('removing an indigenous holiday turns its shift back into a workday when the only 補休 on that date is on a cancelled shift', async () => {
    await client.exec(
      `update attendance_shift set status = 'cancelled' where id = 'substituted';
       insert into attendance_shift (id, organization_id, employee_id, starts_at, ends_at, day_kind)
         values ('substituted-later', '${ORG}', 'emp', '2026-03-12T14:00:00+08:00', '2026-03-12T18:00:00+08:00', 'holiday');`,
    );

    await employees.saveEmployee(actor, employeeDto(['2026-03-10']));

    expect(await dayKinds()).toEqual({
      'indigenous-only': 'holiday',
      substituted: 'workday',
      'substituted-later': 'workday',
      'substitute-only': 'holiday',
    });
  });

  it('editing the shift a 補休 is designated on keeps it a holiday', async () => {
    await shifts.updateShift(actor, 'substitute-only', {
      startsAt: '2026-03-17T10:00:00+08:00',
      endsAt: '2026-03-17T14:00:00+08:00',
    });

    expect(await dayKinds()).toEqual({
      'indigenous-only': 'holiday',
      substituted: 'holiday',
      'substitute-only': 'holiday',
    });
  });

  it('restoring the cancelled shift a 補休 is designated on keeps it a holiday', async () => {
    await shifts.cancelShift(actor, 'substitute-only', { reason: '店休' });
    await shifts.restoreShift(actor, 'substitute-only');

    expect(await dayKinds()).toEqual({
      'indigenous-only': 'holiday',
      substituted: 'holiday',
      'substitute-only': 'holiday',
    });
  });

  const addSameDayShift = (id: string, date: string) =>
    client.exec(
      `insert into attendance_shift (id, organization_id, employee_id, starts_at, ends_at, day_kind)
         values ('${id}', '${ORG}', 'emp', '${date}T14:00:00+08:00', '${date}T18:00:00+08:00', 'holiday')`,
    );

  it('cancelling the shift a 補休 is designated on turns the other shifts on that date back into workdays, and restoring it turns them back into holidays', async () => {
    await addSameDayShift('same-day', '2026-03-17');

    await shifts.cancelShift(actor, 'substitute-only', { reason: '店休' });
    expect(await dayKinds()).toEqual({
      'indigenous-only': 'holiday',
      'same-day': 'workday',
      substituted: 'holiday',
      'substitute-only': 'holiday',
    });

    await shifts.restoreShift(actor, 'substitute-only');
    expect(await dayKinds()).toEqual({
      'indigenous-only': 'holiday',
      'same-day': 'holiday',
      substituted: 'holiday',
      'substitute-only': 'holiday',
    });
  });

  it('cancelling the shift a 補休 is designated on keeps the other shifts a holiday when the date is still an indigenous holiday', async () => {
    await addSameDayShift('same-day', '2026-03-12');

    await shifts.cancelShift(actor, 'substituted', { reason: '店休' });

    expect(await dayKinds()).toEqual({
      'indigenous-only': 'holiday',
      'same-day': 'holiday',
      substituted: 'holiday',
      'substitute-only': 'holiday',
    });
  });

  it('rejects cancelling the shift a 補休 is designated on when a later month is published', async () => {
    await addSameDayShift('same-day', '2026-03-17');
    await client.exec(
      `insert into payroll_statement (id, organization_id, employee_id, employee_name, month, status, snapshot, reason, idempotency_key, created_by, paid_on)
         values ('april', '${ORG}', 'emp', 'Amy', '2026-04', 'published', '{}', 'initial', 'april', 'owner', '2026-05-05')`,
    );

    await expect(
      shifts.cancelShift(actor, 'substitute-only', { reason: '店休' }),
    ).rejects.toThrow('payrollLocked');
    expect(await dayKinds()).toEqual({
      'indigenous-only': 'holiday',
      'same-day': 'holiday',
      substituted: 'holiday',
      'substitute-only': 'holiday',
    });
  });

  it('rejects restoring the shift a 補休 is designated on once its weekday became a rest day', async () => {
    await shifts.cancelShift(actor, 'substitute-only', { reason: '店休' });
    await client.exec(
      `update attendance_employee set regular_leave_weekday = 0, rest_day_weekday = 2 where id = 'emp'`,
    );

    await expect(shifts.restoreShift(actor, 'substitute-only')).rejects.toThrow(
      'holidaySubstituteInvalid',
    );
  });

  it('rejects moving the shift a 補休 is designated on to another date', async () => {
    await expect(
      shifts.updateShift(actor, 'substitute-only', {
        dayKind: 'workday',
        startsAt: '2026-03-18T09:00:00+08:00',
        endsAt: '2026-03-18T13:00:00+08:00',
      }),
    ).rejects.toThrow('holidaySubstituteInvalid');
  });

  it('rejects moving the shift a 補休 is designated on to another employee', async () => {
    await client.exec(
      `insert into "user" (id, name, first_name, email, lang) values ('ben', 'Ben', 'Ben', 'ben@example.com', 'zh-TW');
       insert into member (id, organization_id, user_id, role, created_at) values ('m-ben', '${ORG}', 'ben', 'member', now());
       insert into attendance_employee (id, organization_id, user_id, birth_date, hired_at)
         values ('ben-emp', '${ORG}', 'ben', '1990-01-01', '2026-01-01T00:00:00+08:00');`,
    );

    await expect(
      shifts.updateShift(actor, 'substitute-only', {
        employeeId: 'ben-emp',
        dayKind: 'workday',
        startsAt: '2026-03-17T09:00:00+08:00',
        endsAt: '2026-03-17T13:00:00+08:00',
      }),
    ).rejects.toThrow('holidaySubstituteInvalid');
  });
});
