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
const DAY = 24 * 60 * 60 * 1000;

describe('AttendanceNotificationsService 停權帳號的出勤通知', () => {
  let client: PGlite;
  let service: AttendanceNotificationsService;
  const sendAttendanceNotification = vi.fn();
  const sendAnnualLeaveEntitlement = vi.fn();
  const now = new Date();

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new AttendanceNotificationsService(
      db as unknown as DrizzleDB,
      {
        sendAttendanceNotification,
        sendAnnualLeaveEntitlement,
      } as unknown as MailsService,
      new AttendanceShiftsService(db as unknown as DrizzleDB),
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    sendAttendanceNotification.mockReset();
    sendAnnualLeaveEntitlement.mockReset();
    await client.exec(
      'truncate attendance_annual_leave_notice, attendance_employee, member, organization, "user" cascade',
    );
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('${ORG}', '碧露', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "user" (id, name, first_name, email, lang, banned, ban_expires) values
         ('owner', 'Owner', 'Owner', 'owner@example.com', 'zh-TW', false, null),
         ('banned', 'Banned', 'Banned', 'banned@example.com', 'zh-TW', true, null),
         ('lapsed', 'Lapsed', 'Lapsed', 'lapsed@example.com', 'zh-TW', true, now() - interval '1 day'),
         ('amy', 'Amy', 'Amy', 'amy@example.com', 'zh-TW', false, null);
       insert into member (id, organization_id, user_id, role, created_at) values
         ('m-owner', '${ORG}', 'owner', 'owner', now()),
         ('m-banned', '${ORG}', 'banned', 'owner', now()),
         ('m-lapsed', '${ORG}', 'lapsed', 'owner', now()),
         ('m-amy', '${ORG}', 'amy', 'member', now());
       insert into attendance_employee (id, organization_id, user_id, hired_at) values
         ('emp-amy', '${ORG}', 'amy', now() - interval '1 year'),
         ('emp-banned', '${ORG}', 'banned', now() - interval '1 year');`,
    );
  });

  const subject = (employeeId: string) => ({
    organizationId: ORG,
    employeeId,
    kind: 'leave' as const,
    startsAt: new Date(now.getTime() + DAY),
    endsAt: new Date(now.getTime() + 2 * DAY),
  });

  const recipientsOf = (mock: ReturnType<typeof vi.fn>) =>
    (mock.mock.calls as [{ recipient: { email: string } }][])
      .map(([{ recipient }]) => recipient.email)
      .sort();

  it('送審通知只寄給沒有停權（或停權已到期）的審核者', async () => {
    await service.onSubmitted(subject('emp-amy'));

    expect(recipientsOf(sendAttendanceNotification)).toEqual([
      'lapsed@example.com',
      'owner@example.com',
    ]);
  });

  it('審核結果不寄給停權中的員工', async () => {
    await service.onReviewed({
      ...subject('emp-banned'),
      reviewerUserId: 'owner',
      status: 'approved',
      reason: '',
    });

    expect(sendAttendanceNotification).not.toHaveBeenCalled();
  });

  it('審核結果照常寄給沒有停權的員工', async () => {
    await service.onReviewed({
      ...subject('emp-amy'),
      reviewerUserId: 'owner',
      status: 'approved',
      reason: '',
    });

    expect(recipientsOf(sendAttendanceNotification)).toEqual([
      'amy@example.com',
    ]);
  });

  it('特休通知是法定告知，停權中的員工照樣寄', async () => {
    await client.query('update attendance_employee set hired_at = $1', [
      new Date(now.getTime() - 200 * DAY),
    ]);

    await service.notifyAnnualLeaveEntitlements(now);

    expect(recipientsOf(sendAnnualLeaveEntitlement)).toEqual([
      'amy@example.com',
      'banned@example.com',
    ]);
  });
});
