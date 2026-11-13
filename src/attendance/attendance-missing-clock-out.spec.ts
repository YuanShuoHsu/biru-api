import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { MailsService } from '../mails/mails.service.js';

import { AttendanceNotificationsService } from './attendance-notifications.service.js';
import { AttendanceShiftsService } from './attendance-shifts.service.js';

const ORG = 'org';
const HOUR = 60 * 60 * 1000;

describe('AttendanceNotificationsService.notifyMissingClockOuts', () => {
  let client: PGlite;
  let service: AttendanceNotificationsService;
  let shifts: AttendanceShiftsService;
  const sendMissingClockOut = vi.fn();

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    shifts = new AttendanceShiftsService(db as unknown as DrizzleDB);
    service = new AttendanceNotificationsService(
      db as unknown as DrizzleDB,
      { sendMissingClockOut } as unknown as MailsService,
      shifts,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    sendMissingClockOut.mockReset();
    await client.exec(
      'truncate attendance_request, attendance_event, attendance_shift, attendance_employee, organization, "user" cascade',
    );
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('${ORG}', '碧露', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "user" (id, name, first_name, email, lang) values ('amy', 'Amy', 'Amy', 'amy@example.com', 'zh-TW');
       insert into attendance_employee (id, organization_id, user_id, hired_at) values ('emp', '${ORG}', 'amy', now() - interval '1 year');`,
    );
  });

  const now = new Date();

  // 8 小時的班，下班後還有 4 小時可以打卡
  const addShift = async (id: string, endedHoursAgo: number) => {
    const endsAt = new Date(now.getTime() - endedHoursAgo * HOUR);
    const startsAt = new Date(endsAt.getTime() - 8 * HOUR);
    await client.query(
      `insert into attendance_shift (id, organization_id, employee_id, starts_at, ends_at)
       values ($1, $2, 'emp', $3, $4)`,
      [id, ORG, startsAt, endsAt],
    );
    return { endsAt, startsAt };
  };

  const punch = (
    shiftId: string,
    action: 'clockIn' | 'clockOut',
    occurredAt: Date,
  ) =>
    client.query(
      `insert into attendance_event (id, organization_id, employee_id, shift_id, action, occurred_at, latitude, longitude, accuracy, source_ip, idempotency_key)
       values ($1, $2, 'emp', $3, $4, $5, 0, 0, 0, '203.0.113.1', $1)`,
      [`${shiftId}-${action}`, ORG, shiftId, action, occurredAt],
    );

  const remindedAt = async (id: string) => {
    const { rows } = await client.query<{ reminded: Date | null }>(
      'select missing_clock_out_reminded_at as reminded from attendance_shift where id = $1',
      [id],
    );
    return rows[0].reminded;
  };

  it('打卡時限已過、沒有下班卡的班次通知員工補打卡', async () => {
    const { endsAt, startsAt } = await addShift('forgot', 5);
    await punch('forgot', 'clockIn', startsAt);

    const notified = await service.notifyMissingClockOuts(now);

    expect(notified).toBe(1);
    expect(sendMissingClockOut).toHaveBeenCalledWith({
      recipient: { email: 'amy@example.com', lang: 'zh-TW' },
      organizationName: '碧露',
      path: '/attendance/mine/shifts?organization=biru',
      startsAt,
      endsAt,
    });
    await expect(remindedAt('forgot')).resolves.toBeInstanceOf(Date);
  });

  it('打卡時限在上一輪之前就過了的班次仍會通知（重啟或上一輪失敗）', async () => {
    const { startsAt } = await addShift('missed', 3 * 24);
    await punch('missed', 'clockIn', startsAt);

    await expect(service.notifyMissingClockOuts(now)).resolves.toBe(1);
  });

  it('同一個班次在下一輪不會再通知', async () => {
    const { startsAt } = await addShift('forgot', 5);
    await punch('forgot', 'clockIn', startsAt);

    await expect(service.notifyMissingClockOuts(now)).resolves.toBe(1);
    await expect(
      service.notifyMissingClockOuts(new Date(now.getTime() + 10 * 60 * 1000)),
    ).resolves.toBe(0);
    expect(sendMissingClockOut).toHaveBeenCalledTimes(1);
  });

  it('同時執行的兩輪只寄一次', async () => {
    const { startsAt } = await addShift('forgot', 5);
    await punch('forgot', 'clockIn', startsAt);

    const notified = await Promise.all([
      service.notifyMissingClockOuts(now),
      service.notifyMissingClockOuts(now),
    ]);

    expect(notified[0] + notified[1]).toBe(1);
    expect(sendMissingClockOut).toHaveBeenCalledTimes(1);
  });

  it('寄信失敗的班次不標記，下一輪重寄', async () => {
    const { startsAt } = await addShift('forgot', 5);
    await punch('forgot', 'clockIn', startsAt);
    sendMissingClockOut.mockRejectedValueOnce(new Error('smtp down'));

    await expect(service.notifyMissingClockOuts(now)).resolves.toBe(0);
    await expect(remindedAt('forgot')).resolves.toBeNull();

    await expect(service.notifyMissingClockOuts(now)).resolves.toBe(1);
    expect(sendMissingClockOut).toHaveBeenCalledTimes(2);
  });

  it('下班超過回溯期的班次不通知', async () => {
    const recent = await addShift('recent', 7 * 24 - 1);
    await punch('recent', 'clockIn', recent.startsAt);
    const old = await addShift('old', 7 * 24 + 1);
    await punch('old', 'clockIn', old.startsAt);

    await expect(service.notifyMissingClockOuts(now)).resolves.toBe(1);
    expect(sendMissingClockOut).toHaveBeenCalledWith(
      expect.objectContaining({ endsAt: recent.endsAt }),
    );
    await expect(remindedAt('old')).resolves.toBeNull();
  });

  it('打卡時限晚於這一輪的時間點時留給下一輪，不會寄兩次', async () => {
    const { startsAt } = await addShift('justClosed', 4 + 1 / 60);
    await punch('justClosed', 'clockIn', startsAt);
    const earlier = new Date(now.getTime() - 2 * 60 * 1000);

    await expect(service.notifyMissingClockOuts(earlier)).resolves.toBe(0);
    await expect(service.notifyMissingClockOuts(now)).resolves.toBe(1);
    await expect(service.notifyMissingClockOuts(now)).resolves.toBe(0);
  });

  it('還在可以打卡的時間內不通知', async () => {
    const { startsAt } = await addShift('stillOpen', 1);
    await punch('stillOpen', 'clockIn', startsAt);

    await expect(service.notifyMissingClockOuts(now)).resolves.toBe(0);
  });

  it('已打下班卡、完全沒打卡或已送出補打卡申請的班次都不通知', async () => {
    const done = await addShift('done', 5);
    await punch('done', 'clockIn', done.startsAt);
    await punch('done', 'clockOut', done.endsAt);
    await addShift('absent', 5);
    const requested = await addShift('requested', 5);
    await punch('requested', 'clockIn', requested.startsAt);
    await client.query(
      `insert into attendance_request (id, organization_id, employee_id, shift_id, kind, starts_at, ends_at, reason)
       values ('req', $1, 'emp', 'requested', 'correction', $2, $3, '忘記打卡')`,
      [ORG, requested.startsAt, requested.endsAt],
    );

    await expect(service.notifyMissingClockOuts(now)).resolves.toBe(0);
    expect(sendMissingClockOut).not.toHaveBeenCalled();
  });

  it('提醒標記不出現在班次清單的回應', async () => {
    const { startsAt } = await addShift('forgot', 5);
    await punch('forgot', 'clockIn', startsAt);
    await service.notifyMissingClockOuts(now);

    const { data } = await shifts.shifts(
      { organizationId: ORG, role: 'owner', userId: '' },
      { limit: 10 },
      false,
    );

    expect(data).toHaveLength(1);
    expect(data[0]).not.toHaveProperty('missingClockOutRemindedAt');
  });
});
