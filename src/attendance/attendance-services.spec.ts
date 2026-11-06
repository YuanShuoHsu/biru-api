import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  attendanceEmployee,
  attendanceSettings,
  attendanceShift,
  statutoryHoliday,
} from '../db/schema/attendance.js';
import { payrollStatement } from '../db/schema/payroll.js';

import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { AttendanceEmployeesService } from './attendance-employees.service.js';
import { AttendanceLeavesService } from './attendance-leaves.service.js';
import { AttendanceRequestsService } from './attendance-requests.service.js';
import { AttendanceShiftsService } from './attendance-shifts.service.js';

function database(results: unknown[][], conditions: SQL[] = []) {
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
      query[method] = (condition: SQL) => {
        if (method === 'where') conditions.push(condition);
        return query;
      };
    return query;
  };
  const returning = vi.fn(() =>
    Promise.resolve([{ id: 'event', occurredAt: new Date() }]),
  );
  const values = vi.fn(() => ({
    returning,
    onConflictDoUpdate: vi.fn(() => ({ returning })),
  }));
  const insert = vi.fn(() => ({ values }));
  const db = {
    select: vi.fn(chain),
    execute: vi.fn(),
    insert,
    transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  return { db: db as unknown as DrizzleDB, insert, values };
}

const actor = { organizationId: 'org', userId: 'user', role: 'member' };
const employee = {
  id: 'employee',
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

const requestsService = (db: DrizzleDB) =>
  new AttendanceRequestsService(
    db,
    new AttendanceShiftsService(db),
    new AttendanceLeavesService(db),
    new EventEmitter2(),
  );

describe('attendance services', () => {
  it('rejects terminated employees before writing an event', async () => {
    const { db, insert } = database([
      [{ ...employee, terminatedAt: new Date('2021-01-01') }],
    ]);
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
    ).rejects.toThrow('notFound');
  });
  it('answers a missing request with a 404 carrying the notFound code', async () => {
    const { db } = database([[]]);
    const error: unknown = await requestsService(db)
      .review({ ...actor, role: 'admin' }, 'missing', {
        status: 'approved',
        reason: 'Checked',
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getStatus()).toBe(404);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'notFound',
    });
  });
  it('fails a batch review that names a missing request instead of skipping it', async () => {
    const { db } = database([[]]);
    await expect(
      requestsService(db).reviewBatch(
        { ...actor, role: 'admin' },
        { ids: ['missing'], status: 'approved', reason: 'Checked' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
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
          birthDate: '1990-01-01',
          legalStatus: 'national',
          studentVacations: [],
          workPermits: [],
          pregnancyPeriods: [],
          nursingPeriods: [],
          childcareReductionPeriods: [],
          indigenousHolidays: [],
          hiredAt: '2025-01-01T00:00:00+08:00',
          terminatedAt: '2026-02-01T00:00:00+08:00',
          terminationReason: 'resignation',
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
      indigenousHolidays: [],
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
          birthDate: '1990-01-01',
          legalStatus: 'national',
          studentVacations: [],
          workPermits: [],
          pregnancyPeriods: [],
          nursingPeriods: [],
          childcareReductionPeriods: [],
          indigenousHolidays: [],
          hiredAt: '2025-01-01T00:00:00+08:00',
          terminatedAt,
          terminationReason: terminatedAt ? 'resignation' : undefined,
        }),
      };
    };
    const locked = save('2026-01-15T00:00:00+08:00', [[{ id: 'statement' }]]);
    await expect(locked.result).rejects.toThrow('payrollLocked');
    expect(locked.insert).not.toHaveBeenCalled();
    const unchanged = save(undefined, []);
    await expect(unchanged.result).resolves.toBeDefined();
  });
  it('prevents a manager from reviewing their own request when another reviewer exists', async () => {
    const { db } = database([
      [{ request: { status: 'pending' }, userId: 'user' }],
      [
        { userId: 'user', role: 'owner' },
        { userId: 'another-user', role: 'admin' },
      ],
    ]);
    await expect(
      requestsService(db).review({ ...actor, role: 'owner' }, 'request', {
        status: 'approved',
        reason: 'Checked',
      }),
    ).rejects.toThrow('cannotReviewSelf');
  });
  it('does not review a request twice', async () => {
    const { db } = database([
      [{ request: { status: 'approved' }, userId: 'another-user' }],
    ]);
    await expect(
      requestsService(db).review({ ...actor, role: 'admin' }, 'request', {
        status: 'approved',
        reason: 'Checked',
      }),
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
      requestsService(db).review(reviewer, 'request', review);
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
        (db) =>
          new AttendanceShiftsService(db).cancelShift(reviewer, 'shift', {
            reason: 'correction',
          }),
        [[shift], [], [], [], published],
      ],
    ];
    for (const [run, rows] of cases) {
      const { db, insert } = database(rows);
      await expect(run(db)).rejects.toThrow('payrollLocked');
      expect(insert).not.toHaveBeenCalled();
    }
  });
  it('locks every month from the shift start onward when a shift changes', async () => {
    const manager = { ...actor, role: 'owner' };
    const shift = {
      id: 'shift',
      organizationId: 'org',
      employeeId: 'employee',
      status: 'scheduled',
      dayKind: 'workday',
      startsAt: new Date('2026-01-15T01:00:00Z'),
      endsAt: new Date('2026-01-15T10:00:00Z'),
    };
    const cases: ((db: DrizzleDB) => Promise<unknown>)[] = [
      (db) =>
        new AttendanceShiftsService(db).updateShift(manager, 'shift', {
          startsAt: '2026-01-15T01:00:00Z',
          endsAt: '2026-01-15T11:00:00Z',
        }),
      (db) =>
        new AttendanceShiftsService(db).cancelShift(manager, 'shift', {
          reason: 'correction',
        }),
    ];
    for (const run of cases) {
      const conditions: SQL[] = [];
      const { db } = database(
        [[shift], [], [], [], [{ id: 'statement' }]],
        conditions,
      );
      await expect(run(db)).rejects.toThrow('payrollLocked');
      const months = conditions
        .flatMap((condition) => new PgDialect().sqlToQuery(condition).params)
        .filter((param) => /^\d{4}-\d{2}$/.test(String(param)));
      expect(months).toEqual(['2026-01']);
    }
  });
});

describe('shift changes behind a published payslip', () => {
  const lockingDatabase = (published: string[]) => {
    const rows = (table: unknown, where: SQL | undefined) => {
      if (table === attendanceEmployee) return [scheduledEmployee];
      if (table === statutoryHoliday)
        return [
          { date: '2026-01-01', name: '開國紀念日' },
          { date: '2026-01-17', name: '補假' },
        ];
      if (table === attendanceShift) return shifts.splice(0);
      if (table === attendanceSettings)
        return [{ agreedFrom: '2020-01-01', periods: [] }];
      if (table !== payrollStatement || !where) return [];
      const { sql: text, params } = new PgDialect().sqlToQuery(where);
      const bound = (operator: string) => {
        const match = new RegExp(`"month" ${operator} \\$(\\d+)`).exec(text);
        return match ? String(params[Number(match[1]) - 1]) : undefined;
      };
      const from = bound('>=');
      const to = bound('<=');
      return published
        .filter((month) => (!from || month >= from) && (!to || month <= to))
        .map((month) => ({ id: month }));
    };
    let shifts: unknown[] = [];
    const chain = () => {
      let table: unknown;
      let where: SQL | undefined;
      const query: Record<string, unknown> = {
        then: (
          resolve: (value: unknown) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(rows(table, where)).then(resolve, reject),
        from: (value: unknown) => {
          table = value;
          return query;
        },
        where: (condition: SQL) => {
          where = condition;
          return query;
        },
      };
      for (const method of [
        'orderBy',
        'limit',
        'offset',
        'innerJoin',
        'leftJoin',
        'groupBy',
      ])
        query[method] = () => query;
      return query;
    };
    const write = () => {
      const query: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve([]).then(resolve),
      };
      for (const method of ['values', 'set', 'where', 'returning'])
        query[method] = () => query;
      return query;
    };
    const db = {
      select: vi.fn(chain),
      execute: vi.fn(),
      insert: vi.fn(write),
      update: vi.fn(write),
      transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
    };
    return {
      db: db as unknown as DrizzleDB,
      setShifts: (value: unknown[]) => {
        shifts = value;
      },
    };
  };
  const scheduledEmployee = {
    id: 'employee',
    userId: 'user',
    organizationId: 'org',
    hiredAt: new Date('2020-01-01T00:00:00+08:00'),
    terminatedAt: null,
    birthDate: '1990-01-01',
    legalStatus: 'national',
    workPermits: [],
    studentVacations: [],
    pregnancyPeriods: [],
    nursingPeriods: [],
    childcareReductionPeriods: [],
    indigenousHolidays: [],
    regularLeaveWeekday: 0,
    restDayWeekday: 6,
  };
  const manager = { ...actor, userId: 'manager', role: 'owner' };
  const january = {
    startsAt: '2026-01-14T01:00:00.000Z',
    endsAt: '2026-01-14T09:00:00.000Z',
  };
  const february = {
    startsAt: '2026-02-11T01:00:00.000Z',
    endsAt: '2026-02-11T09:00:00.000Z',
  };
  const march = {
    startsAt: '2026-03-11T01:00:00.000Z',
    endsAt: '2026-03-11T09:00:00.000Z',
  };
  const januaryRestDay = {
    startsAt: '2026-01-24T01:00:00.000Z',
    endsAt: '2026-01-24T09:00:00.000Z',
  };
  const shiftRow = (interval: typeof january, dayKind = 'workday') => ({
    id: 'shift',
    organizationId: 'org',
    employeeId: 'employee',
    teamId: null,
    status: 'scheduled',
    startsAt: new Date(interval.startsAt),
    endsAt: new Date(interval.endsAt),
    breaks: [],
    paidBreak: false,
    dayKind,
  });
  const create = (db: DrizzleDB, interval: typeof january) =>
    new AttendanceShiftsService(db).createShifts(
      manager,
      [{ employeeId: 'employee', ...interval }],
      true,
    );
  const update = (
    db: DrizzleDB,
    from: typeof january,
    to: typeof january,
    setShifts: (value: unknown[]) => void,
  ) => {
    setShifts([shiftRow(from)]);
    return new AttendanceShiftsService(db).updateShift(manager, 'shift', {
      ...to,
      dryRun: true,
    });
  };
  const cancel = (
    db: DrizzleDB,
    interval: typeof january,
    setShifts: (value: unknown[]) => void,
    dayKind?: string,
  ) => {
    setShifts([shiftRow(interval, dayKind)]);
    return new AttendanceShiftsService(db).cancelShift(manager, 'shift', {
      reason: 'correction',
      irreversible: true,
    });
  };

  type Run = (database: ReturnType<typeof lockingDatabase>) => Promise<unknown>;
  it.each<[string, Run]>([
    ['create', ({ db }) => create(db, january)],
    [
      'update within January',
      ({ db, setShifts }) => update(db, january, january, setShifts),
    ],
    [
      'update from January to March',
      ({ db, setShifts }) => update(db, january, march, setShifts),
    ],
    [
      'update from March to January',
      ({ db, setShifts }) => update(db, march, january, setShifts),
    ],
    ['cancel', ({ db, setShifts }) => cancel(db, january, setShifts)],
  ])('locks a later published month on a January shift %s', async (_, run) => {
    await expect(run(lockingDatabase(['2026-02']))).rejects.toThrow(
      'payrollLocked',
    );
  });
  it.each<[string, Run]>([
    ['create', ({ db }) => create(db, february)],
    [
      'update',
      ({ db, setShifts }) => update(db, february, february, setShifts),
    ],
    ['cancel', ({ db, setShifts }) => cancel(db, february, setShifts)],
  ])(
    'allows a February shift %s when only January is published',
    async (_, run) => {
      await expect(run(lockingDatabase(['2026-01']))).resolves.toBeDefined();
    },
  );
  it.each<[string, Run]>([
    ['create', ({ db }) => create(db, januaryRestDay)],
    [
      'cancel',
      ({ db, setShifts }) => cancel(db, januaryRestDay, setShifts, 'restDay'),
    ],
  ])(
    'allows a January rest-day shift %s when only February is published',
    async (_, run) => {
      await expect(run(lockingDatabase(['2026-02']))).resolves.toBeDefined();
    },
  );
  it('locks a later published month when a January shift becomes a holiday substitute', async () => {
    const { db, setShifts } = lockingDatabase(['2026-02']);
    setShifts([shiftRow(january)]);
    await expect(
      new AttendanceLeavesService(db).createHolidaySubstitute(manager, {
        employeeId: 'employee',
        holidayDate: '2026-01-17',
        shiftId: 'shift',
      }),
    ).rejects.toThrow('payrollLocked');
  });
});
