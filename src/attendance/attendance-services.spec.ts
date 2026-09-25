jest.mock('src/auth/permissions', () => ({ isAuthorized: () => true }));

import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import { AttendanceEmployeesService } from './attendance-employees.service';
import { AttendanceRequestsService } from './attendance-requests.service';
import { AttendanceShiftsService } from './attendance-shifts.service';
import { AttendanceTemplatesService } from './attendance-templates.service';

function database(results: unknown[][]) {
  const chain = () => {
    const promise = Promise.resolve(results.shift() ?? []);
    const query: Record<string, unknown> = { then: promise.then.bind(promise) };
    for (const method of [
      'from',
      'where',
      'orderBy',
      'limit',
      'offset',
      'innerJoin',
    ])
      query[method] = () => query;
    return query;
  };
  const returning = jest.fn(() =>
    Promise.resolve([{ id: 'event', occurredAt: new Date() }]),
  );
  const values = jest.fn(() => ({
    returning,
    onConflictDoUpdate: jest.fn(() => ({ returning })),
  }));
  const insert = jest.fn(() => ({ values }));
  const db = {
    select: jest.fn(chain),
    execute: jest.fn(),
    insert,
    transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  return { db: db as unknown as DrizzleDB, insert, values };
}

const actor = { organizationId: 'org', userId: 'user', role: 'member' };
const employee = {
  id: 'employee',
  enabled: true,
  hiredAt: new Date('2020-01-01'),
  terminatedAt: null,
};

const settings = {
  latitude: 25,
  longitude: 121,
  radiusMeters: 100,
  allowedIps: ['203.0.113.1'],
};

const dto = () => ({
  shiftId: 'shift',
  idempotencyKey: 'key',
  action: 'clockIn' as const,
  latitude: 25,
  longitude: 121,
  accuracy: 10,
  locatedAt: new Date().toISOString(),
});

describe('attendance services', () => {
  it('rejects disabled employees before writing an event', async () => {
    const { db, insert } = database([[{ ...employee, enabled: false }]]);
    await expect(
      new AttendanceShiftsService(db).punch(actor, dto(), '203.0.113.1'),
    ).rejects.toThrow('employeeNotEnabled');
    expect(insert).not.toHaveBeenCalled();
  });
  it('returns an existing event for an identical retry', async () => {
    const { db, insert } = database([
      [employee],
      [
        {
          id: 'existing',
          shiftId: 'shift',
          action: 'clockIn',
          occurredAt: new Date(),
        },
      ],
    ]);
    await expect(
      new AttendanceShiftsService(db).punch(actor, dto(), '203.0.113.1'),
    ).resolves.toHaveProperty('id', 'existing');
    expect(insert).not.toHaveBeenCalled();
  });
  it('rejects reuse of a retry key for a different action', async () => {
    const { db } = database([
      [employee],
      [{ shiftId: 'shift', action: 'clockOut' }],
    ]);
    await expect(
      new AttendanceShiftsService(db).punch(actor, dto(), '203.0.113.1'),
    ).rejects.toThrow('idempotencyConflict');
  });
  it('requires both approved network and location', async () => {
    const first = database([[employee], [], [settings]]);
    await expect(
      new AttendanceShiftsService(first.db).punch(actor, dto(), '203.0.113.2'),
    ).rejects.toThrow('ipNotAllowed');
    const second = database([[employee], [], [settings]]);
    await expect(
      new AttendanceShiftsService(second.db).punch(
        actor,
        { ...dto(), latitude: 26 },
        '203.0.113.1',
      ),
    ).rejects.toThrow('locationNotAllowed');
    expect(first.insert).not.toHaveBeenCalled();
    expect(second.insert).not.toHaveBeenCalled();
  });
  it('rejects stale or inaccurate locations', async () => {
    for (const override of [
      { locatedAt: '2020-01-01T00:00:00Z' },
      { accuracy: 101 },
    ]) {
      const { db, insert } = database([[employee], [], [settings]]);
      await expect(
        new AttendanceShiftsService(db).punch(
          actor,
          { ...dto(), ...override },
          '203.0.113.1',
        ),
      ).rejects.toThrow('locationNotAllowed');
      expect(insert).not.toHaveBeenCalled();
    }
  });
  it('rejects a shift that is not owned by the employee', async () => {
    const { db } = database([[employee], [], [settings], []]);
    await expect(
      new AttendanceShiftsService(db).punch(actor, dto(), '203.0.113.1'),
    ).rejects.toThrow('Not Found');
  });
  it('refuses to end employment before approved leave or a leave case', async () => {
    for (const outside of [
      [[{ id: 'request' }], []],
      [[], [{ id: 'case' }]],
    ]) {
      const { db, insert } = database([
        [{ name: 'Member' }],
        [{ id: 'employee' }],
        [],
        ...outside,
      ]);
      await expect(
        new AttendanceEmployeesService(db).saveEmployee(actor, {
          userId: 'user',
          enabled: true,
          legalStatus: 'national',
          hiredAt: '2025-01-01T00:00:00+08:00',
          terminatedAt: '2026-02-01T00:00:00+08:00',
        }),
      ).rejects.toThrow('employmentWindowConflict');
      expect(insert).not.toHaveBeenCalled();
    }
  });
  it('does not move employment dates behind a published payslip', async () => {
    const current = {
      id: 'employee',
      hiredAt: new Date('2025-01-01T00:00:00+08:00'),
      terminatedAt: null,
    };
    const save = (terminatedAt: string | undefined, rows: unknown[][]) => {
      const { db, insert } = database([
        [{ name: 'Member' }],
        [current],
        [],
        [],
        [],
        ...rows,
      ]);
      return {
        insert,
        result: new AttendanceEmployeesService(db).saveEmployee(actor, {
          userId: 'user',
          enabled: true,
          legalStatus: 'national',
          hiredAt: '2025-01-01T00:00:00+08:00',
          terminatedAt,
        }),
      };
    };
    const locked = save('2026-01-15T00:00:00+08:00', [[{ id: 'statement' }]]);
    await expect(locked.result).rejects.toThrow('payrollLocked');
    expect(locked.insert).not.toHaveBeenCalled();
    const unchanged = save(undefined, []);
    await expect(unchanged.result).resolves.toBeDefined();
  });
  it('prevents a manager from reviewing their own request', async () => {
    const { db } = database([
      [{ request: { status: 'pending' }, userId: 'user' }],
    ]);
    await expect(
      new AttendanceRequestsService(db).review(
        { ...actor, role: 'owner' },
        'request',
        {
          status: 'approved',
          reason: 'Checked',
        },
      ),
    ).rejects.toThrow('cannotReviewSelf');
  });
  it('does not review a request twice', async () => {
    const { db } = database([
      [{ request: { status: 'approved' }, userId: 'another-user' }],
    ]);
    await expect(
      new AttendanceRequestsService(db).review(
        { ...actor, role: 'admin' },
        'request',
        {
          status: 'approved',
          reason: 'Checked',
        },
      ),
    ).rejects.toThrow('requestAlreadyReviewed');
  });
  it('does not change attendance behind a published payslip', async () => {
    const reviewer = { ...actor, userId: 'manager', role: 'owner' };
    const review = { status: 'approved' as const, reason: 'Checked' };
    const published = [{ id: 'statement' }];
    const leave = {
      id: 'request',
      organizationId: 'org',
      employeeId: 'employee',
      kind: 'leave',
      status: 'pending',
      startsAt: new Date('2026-01-05T01:00:00Z'),
      endsAt: new Date('2026-01-05T10:00:00Z'),
    };
    const shift = {
      id: 'shift',
      employeeId: 'employee',
      startsAt: new Date('2026-01-31T14:00:00Z'),
      endsAt: new Date('2026-01-31T23:00:00Z'),
    };
    const reviewing = (db: DrizzleDB) =>
      new AttendanceRequestsService(db).review(reviewer, 'request', review);
    const cases: [(db: DrizzleDB) => Promise<unknown>, unknown[][]][] = [
      [reviewing, [[{ request: leave, userId: 'user' }], published]],
      [
        reviewing,
        [
          [
            {
              request: { ...leave, status: 'cancellationPending' },
              userId: 'user',
            },
          ],
          [],
          published,
        ],
      ],
      [
        reviewing,
        [
          [
            {
              request: {
                ...leave,
                kind: 'correction',
                shiftId: 'shift',
                startsAt: new Date('2026-01-31T16:30:00Z'),
                endsAt: new Date('2026-01-31T23:00:00Z'),
              },
              userId: 'user',
            },
          ],
          [shift],
          published,
        ],
      ],
      [
        (db) => new AttendanceShiftsService(db).cancelShift(reviewer, 'shift'),
        [[shift], [], [], [], published],
      ],
    ];
    for (const [run, rows] of cases) {
      const { db, insert } = database(rows);
      await expect(run(db)).rejects.toThrow('payrollLocked');
      expect(insert).not.toHaveBeenCalled();
    }
  });
  it('rejects template breaks outside the shift', async () => {
    const db = database([]).db;
    const service = new AttendanceTemplatesService(
      db,
      new AttendanceShiftsService(db),
    );
    const template = {
      employeeId: 'employee',
      name: 'day',
      weekday: 1,
      startTime: '09:00',
      endTime: '18:00',
      nextDay: false,
      paidBreak: false,
      dayKind: 'workday' as const,
    };
    await expect(
      service.saveTemplate(actor, {
        ...template,
        breaks: [{ startTime: '17:30', endTime: '18:30' }],
      }),
    ).rejects.toThrow('invalidBreak');
    await expect(
      service.saveTemplate(actor, {
        ...template,
        breaks: [{ startTime: '12:00', endTime: '13:00' }],
      }),
    ).rejects.toThrow('continuousWorkTooLong');
  });
});
