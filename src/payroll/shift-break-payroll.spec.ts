import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import { calculatePayroll } from './payroll-calculation';
import type { PayrollRulesService } from './payroll-rules.service';
import { PayrollService } from './payroll.service';
import { taiwan2026 } from './taiwan-rules.fixture';

jest.mock('./payroll-calculation', () => ({
  ...jest.requireActual<typeof import('./payroll-calculation')>(
    './payroll-calculation',
  ),
  calculatePayroll: jest.fn(() => ({ blockers: [] })),
}));
const at = (hour: string) => new Date(`2026-01-15T${hour}:00+08:00`);
const scheduledWeeks = (weeklyMinutes: number, before: Date) =>
  Array.from({ length: 52 * 5 }, (_, index) => {
    const startsAt = new Date(
      before.getTime() -
        (Math.floor(index / 5) + 1) * 7 * 86400000 +
        (index % 5) * 86400000,
    );
    return {
      employeeId: 'employee',
      startsAt,
      endsAt: new Date(startsAt.getTime() + (weeklyMinutes / 5) * 60000),
      paidBreak: false,
      breaks: [],
    };
  });

async function snapshot(
  leave: [string, string],
  breakWindow: [string, string] | null,
  paidBreak = false,
  options: {
    salaryType?: 'monthly' | 'hourly';
    ruleSet?: { stale?: boolean; unconfirmed?: string[]; rules?: object };
    weeklyMinutes?: number;
    insurance?: object;
    adjacentShifts?: object[];
  } = {},
) {
  const employee = {
    id: 'employee',
    organizationId: 'org',
    hiredAt: new Date('2020-01-01'),
    terminatedAt: null,
  };
  const shift = {
    id: 'shift',
    startsAt: at('09:00'),
    endsAt: at('18:00'),
    breaks: breakWindow
      ? [
          {
            startsAt: at(breakWindow[0]).toISOString(),
            endsAt: at(breakWindow[1]).toISOString(),
          },
        ]
      : [],
    dayKind: 'workday',
    paidBreak,
  };
  const request = {
    id: 'leave',
    startsAt: at(leave[0]),
    endsAt: at(leave[1]),
    kind: 'leave',
    status: 'approved',
    leaveTypeId: 'personal',
    paidPercent: 0,
    shiftId: null,
  };
  const results: unknown[][] = [
    options.weeklyMinutes
      ? scheduledWeeks(
          options.weeklyMinutes,
          new Date('2026-01-01T00:00:00+08:00'),
        )
      : [],
    [
      {
        terms: {
          salaryType: options.salaryType ?? 'monthly',
          salaryCents: '4800000',
          allowanceCents: '0',
          insurance: options.insurance,
        },
      },
    ],
    [shift, ...(options.adjacentShifts ?? [])],
    [],
    [request],
    [{ id: 'personal', statutoryKind: 'personal', paidPercent: 0 }],
  ];
  const db = {
    select: () => {
      const result = Promise.resolve(results.shift());
      const query: Record<string, unknown> = { then: result.then.bind(result) };
      for (const key of ['from', 'where', 'orderBy', 'limit'])
        query[key] = () => query;
      return query;
    },
  };
  const service = new PayrollService(
    db as unknown as DrizzleDB,
    {
      resolve: () =>
        Promise.resolve({
          rules: {},
          ruleVersion: 'test',
          stale: false,
          unconfirmed: [],
          ...options.ruleSet,
        }),
    } as unknown as PayrollRulesService,
  );
  const calculate = Reflect.get(service, 'snapshot') as (
    ...args: unknown[]
  ) => Promise<{ blockers: string[] }>;
  const { blockers } = await calculate.call(
    service,
    db,
    { organizationId: 'org', userId: 'owner', role: 'owner' },
    employee.id,
    '2026-01',
    employee,
  );
  const [, , days, deduction] = jest
    .mocked(calculatePayroll)
    .mock.calls.at(-1)!;
  return { blockers, days, deduction };
}

describe('Scheduled unpaid breaks in leave payroll', () => {
  beforeEach(() => jest.clearAllMocks());
  it('deducts a full day of unpaid leave as the eight working hours', async () => {
    const result = await snapshot(['09:00', '18:00'], ['12:00', '13:00']);
    expect(result.deduction).toBe(8 * 3600);
    expect(result.days).toEqual([
      expect.objectContaining({ scheduledSeconds: 8 * 3600 }),
    ]);
    expect(result.blockers).not.toContain('incompleteAttendance');
  });
  it('does not deduct the lunch hour a morning leave runs through', async () => {
    const result = await snapshot(['09:00', '13:00'], ['12:00', '13:00']);
    expect(result.deduction).toBe(3 * 3600);
  });
  it('keeps the whole span as work time when no break is scheduled or it is paid', async () => {
    expect((await snapshot(['09:00', '18:00'], null)).deduction).toBe(9 * 3600);
    expect(
      (await snapshot(['09:00', '18:00'], ['12:00', '13:00'], true)).deduction,
    ).toBe(9 * 3600);
  });
});

describe('Rule set freshness blockers', () => {
  const draft = (
    salaryType: 'monthly' | 'hourly',
    ruleSet: { stale?: boolean; unconfirmed?: string[] },
  ) =>
    snapshot(['09:00', '18:00'], null, false, { salaryType, ruleSet }).then(
      (result) => result.blockers,
    );
  it('holds every draft until the official ladders were checked in that month', async () => {
    expect(await draft('monthly', { stale: true })).toContain(
      'payrollRuleSetStale',
    );
    expect(await draft('monthly', {})).not.toContain('payrollRuleSetStale');
  });
  it('holds only hourly drafts while the hourly minimum wage is unconfirmed', async () => {
    const unconfirmed = ['minimumHourlyWageCents'];
    expect(await draft('hourly', { unconfirmed })).toContain(
      'minimumWageUnconfirmed',
    );
    expect(await draft('monthly', { unconfirmed })).not.toContain(
      'minimumWageUnconfirmed',
    );
  });
});

describe('Payroll eligibility blockers', () => {
  beforeEach(() => jest.clearAllMocks());
  const insurance = {
    laborCoverage: 'both',
    laborLadder: 'partTime',
    laborBasis: 11100,
    healthBasis: 29500,
  };
  const blockersFor = (weeklyMinutes: number) =>
    snapshot(['09:00', '18:00'], null, false, {
      weeklyMinutes,
      insurance,
      ruleSet: { rules: taiwan2026 },
    }).then((result) => result.blockers);
  it('holds a part-time ladder once the employee works full time', async () => {
    expect(await blockersFor(2400)).toContain('partTimeLadderRequiresPartTime');
    expect(await blockersFor(1200)).not.toContain(
      'partTimeLadderRequiresPartTime',
    );
  });

  const week = (monday: string) =>
    Array.from({ length: 6 }, (_, index) => {
      const startsAt = new Date(
        new Date(`${monday}T09:00:00+08:00`).getTime() + index * 86400000,
      );
      return {
        id: `${monday}-${index}`,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 9 * 3600000),
        breaks: [],
        dayKind: 'workday',
        paidBreak: false,
      };
    });
  const weeklyBlocked = (adjacentShifts: object[]) =>
    snapshot(['09:00', '18:00'], null, false, { adjacentShifts }).then(
      (result) => result.blockers.includes('weeklyScheduleRequiresReview'),
    );
  it('ignores an over-scheduled week that ends before the payroll month', async () => {
    expect(await weeklyBlocked(week('2025-12-22'))).toBe(false);
  });
  it('still reviews an over-scheduled week that runs into the payroll month', async () => {
    expect(await weeklyBlocked(week('2025-12-29'))).toBe(true);
  });
});
