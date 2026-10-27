import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

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
  const sendMissingClockOut = vi.fn();

  beforeAll(async () => {
    client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new AttendanceNotificationsService(
      db as unknown as DrizzleDB,
      { sendMissingClockOut } as unknown as MailsService,
      new AttendanceShiftsService(db as unknown as DrizzleDB),
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
      `insert into organization (id, name, slug, created_at) values ('${ORG}', '碧露', 'biru', now());
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

  it('打卡時限剛過、沒有下班卡的班次通知員工補打卡', async () => {
    const { endsAt, startsAt } = await addShift('forgot', 5);
    await punch('forgot', 'clockIn', startsAt);

    const notified = await service.notifyMissingClockOuts(
      new Date(now.getTime() - 2 * HOUR),
      now,
    );

    expect(notified).toBe(1);
    expect(sendMissingClockOut).toHaveBeenCalledWith({
      recipient: { email: 'amy@example.com', lang: 'zh-TW' },
      organizationName: '碧露',
      path: '/attendance/mine/shifts?organization=biru',
      startsAt,
      endsAt,
    });
  });

  it('同一個班次在下一輪不會再通知', async () => {
    const { startsAt } = await addShift('forgot', 5);
    await punch('forgot', 'clockIn', startsAt);

    await expect(
      service.notifyMissingClockOuts(
        new Date(now.getTime() - 10 * 60 * 1000),
        now,
      ),
    ).resolves.toBe(0);
  });

  it('打卡時限晚於這一輪的時間點時留給下一輪，不會寄兩次', async () => {
    const { startsAt } = await addShift('justClosed', 4 + 1 / 60);
    await punch('justClosed', 'clockIn', startsAt);
    const earlier = new Date(now.getTime() - 2 * 60 * 1000);

    await expect(
      service.notifyMissingClockOuts(
        new Date(earlier.getTime() - 10 * 60 * 1000),
        earlier,
      ),
    ).resolves.toBe(0);
    await expect(service.notifyMissingClockOuts(earlier, now)).resolves.toBe(1);
  });

  it('還在可以打卡的時間內不通知', async () => {
    const { startsAt } = await addShift('stillOpen', 1);
    await punch('stillOpen', 'clockIn', startsAt);

    await expect(
      service.notifyMissingClockOuts(new Date(now.getTime() - 2 * HOUR), now),
    ).resolves.toBe(0);
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

    await expect(
      service.notifyMissingClockOuts(new Date(now.getTime() - 2 * HOUR), now),
    ).resolves.toBe(0);
    expect(sendMissingClockOut).not.toHaveBeenCalled();
  });
});
