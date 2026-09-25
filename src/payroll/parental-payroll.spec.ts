import { DAY_MS, platformMonthStart } from 'src/common/constants/timezone';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { PayrollRulesService } from './payroll-rules.service';
import { PayrollService } from './payroll.service';
import { taiwan2026 } from './taiwan-rules.fixture';

const at = (value: string) => new Date(`${value}+08:00`);
const shift = (
  id: string,
  startsAt: string,
  endsAt: string,
  dayKind = 'holiday',
) => ({
  id,
  startsAt: at(startsAt),
  endsAt: at(endsAt),
  dayKind,
  paidBreak: false,
});

async function snapshot(
  shifts: ReturnType<typeof shift>[],
  leaveStart: string,
  leaveEnd: string,
  month = '2026-01',
  workedShift?: ReturnType<typeof shift>,
  options: {
    pendingReturns?: { returnsAt: Date; originalEndsAt: Date }[];
    originalEndsAt?: Date;
  } = {},
) {
  const employee = {
    id: 'employee',
    organizationId: 'org',
    hiredAt: at('2020-01-01T00:00:00'),
    terminatedAt: null,
    weeklyMinutes: 2400,
    legalStatus: 'national',
    birthDate: '1990-01-01',
    pregnancyPeriods: [],
    nursingPeriods: [],
    indigenousHolidays: [],
  };
  const request = {
    id: 'leave',
    kind: 'leave',
    status: 'approved',
    leaveTypeId: 'parental',
    leaveCaseId: 'child',
    paidPercent: 0,
    startsAt: at(leaveStart),
    endsAt: at(leaveEnd),
    shiftId: null,
    leaveMinutes: (at(leaveEnd).getTime() - at(leaveStart).getTime()) / 60000,
    originalEndsAt: options.originalEndsAt ?? null,
  };
  const events = workedShift
    ? [
        {
          id: 'in',
          shiftId: workedShift.id,
          action: 'clockIn',
          occurredAt: workedShift.startsAt,
          paidBreak: false,
        },
        {
          id: 'out',
          shiftId: workedShift.id,
          action: 'clockOut',
          occurredAt: workedShift.endsAt,
          paidBreak: false,
        },
      ]
    : [];
  const [year, monthNumber] = month.split('-').map(Number);
  const monthStart = platformMonthStart(year, monthNumber - 1);
  const monthEnd = platformMonthStart(year, monthNumber);
  const results: unknown[][] = [
    [],
    [
      {
        terms: {
          insurance: {
            laborCoverage: 'both',
            laborBasis: 29500,
            occupationalBasis: 29500,
            healthBasis: 29500,
            healthDependents: 0,
            pensionBasis: 29500,
            voluntaryPercent: 0,
            employerPercent: 6,
            taxMethod: 'resident5',
            withholdingDependents: 0,
          },
          salaryType: 'hourly',
          salaryCents: '24000',
          allowanceCents: '0',
          monthlyProration: 'calendarDays',
          otherDeductionCents: '0',
        },
      },
    ],
    shifts,
    ...(shifts.some(
      (item) =>
        item.startsAt < new Date(monthEnd.getTime() + DAY_MS) &&
        item.endsAt > new Date(monthStart.getTime() - DAY_MS),
    )
      ? [events]
      : []),
    [request],
    [{ id: 'parental', statutoryKind: 'parental' }],
    [],
    [{ hiredAt: employee.hiredAt, terminatedAt: null }],
    [],
    options.pendingReturns ?? [],
    [{ id: 'child', dailyPayCents: '0' }],
  ];
  const db = {
    select: () => {
      const result = Promise.resolve(results.shift() ?? []);
      const query: Record<string, unknown> = { then: result.then.bind(result) };
      for (const key of [
        'from',
        'innerJoin',
        'leftJoin',
        'where',
        'orderBy',
        'limit',
      ])
        query[key] = () => query;
      return query;
    },
  };
  const service = new PayrollService(
    db as unknown as DrizzleDB,
    {
      resolve: () =>
        Promise.resolve({
          rules: taiwan2026,
          ruleVersion: 'test',
          unconfirmed: [],
        }),
    } as unknown as PayrollRulesService,
  );
  const calculate = Reflect.get(service, 'snapshot') as (
    ...args: unknown[]
  ) => Promise<{
    sourceFingerprint: string;
    netCents: string;
    grossCents: string;
    deductionCents: string;
    blockers: string[];
    lines: { code: string; amountCents: string }[];
  }>;
  return calculate.call(
    service,
    db,
    { organizationId: 'org', userId: 'owner', role: 'owner' },
    employee.id,
    month,
    employee,
    {
      overtimeExtensionPeriods: [],
      occupationalIndustryCode: null,
      occupationalExperienceRateMicros: 1200,
      holidays: [],
    },
  );
}

describe('Parental leave holiday wages', () => {
  it.each(['holiday', 'regularLeave'])(
    'does not pay an unworked %s shift during full-month leave',
    async (kind) => {
      const result = await snapshot(
        [shift('a', '2026-01-15T09:00:00', '2026-01-15T17:00:00', kind)],
        '2026-01-01T00:00:00',
        '2026-02-01T00:00:00',
      );
      expect(result.netCents).toBe('0');
      expect(result.deductionCents).toBe('0');
      expect(result.blockers).toEqual([]);
    },
  );
  it('retains holiday wages outside the leave dates in a partial month', async () => {
    const result = await snapshot(
      [
        shift('a', '2026-01-15T09:00:00', '2026-01-15T17:00:00'),
        shift('b', '2026-01-16T09:00:00', '2026-01-16T17:00:00'),
      ],
      '2026-01-15T00:00:00',
      '2026-01-16T00:00:00',
    );
    expect(result.grossCents).toBe('192000');
  });
  it('deducts only the leave portion of a shift crossing the month boundary', async () => {
    const shifts = [shift('a', '2025-12-31T20:00:00', '2026-01-01T04:00:00')];
    const december = await snapshot(
      shifts,
      '2026-01-01T00:00:00',
      '2026-01-02T00:00:00',
      '2025-12',
    );
    const january = await snapshot(
      shifts,
      '2026-01-01T00:00:00',
      '2026-01-02T00:00:00',
    );
    expect(december.grossCents).toBe('96000');
    expect(january.grossCents).toBe('0');
  });
  it('preserves worked wages after returning from leave', async () => {
    const worked = shift(
      'b',
      '2026-01-16T09:00:00',
      '2026-01-16T17:00:00',
      'workday',
    );
    const result = await snapshot(
      [shift('a', '2026-01-15T09:00:00', '2026-01-15T17:00:00'), worked],
      '2026-01-15T00:00:00',
      '2026-01-16T00:00:00',
      '2026-01',
      worked,
    );
    expect(result.grossCents).toBe('192000');
    expect(result.blockers).toEqual([]);
  });
  it('keeps the original eight-hour holiday basis when leave starts after it', async () => {
    const result = await snapshot(
      [shift('a', '2026-01-15T14:00:00', '2026-01-16T02:00:00')],
      '2026-01-16T00:00:00',
      '2026-01-17T00:00:00',
    );
    expect(result.grossCents).toBe('192000');
  });
});

describe('Parental early-return payroll', () => {
  const shifts = [shift('a', '2026-01-15T09:00:00', '2026-01-15T17:00:00')];
  it('blocks only months touched by a pending early return', async () => {
    const options = {
      pendingReturns: [
        {
          returnsAt: at('2026-02-01T00:00:00'),
          originalEndsAt: at('2026-04-01T00:00:00'),
        },
      ],
    };
    const prior = await snapshot(
      shifts,
      '2026-01-01T00:00:00',
      '2026-04-01T00:00:00',
      '2026-01',
      undefined,
      options,
    );
    const affected = await snapshot(
      shifts,
      '2026-01-01T00:00:00',
      '2026-04-01T00:00:00',
      '2026-02',
      undefined,
      options,
    );
    const after = await snapshot(
      shifts,
      '2026-01-01T00:00:00',
      '2026-04-01T00:00:00',
      '2026-04',
      undefined,
      options,
    );
    expect(prior.blockers).not.toContain('parentalReturnPending');
    expect(affected.blockers).toContain('parentalReturnPending');
    expect(after.blockers).not.toContain('parentalReturnPending');
  });
  it('keeps prior-month fingerprints stable after an early return approval', async () => {
    const before = await snapshot(
      shifts,
      '2026-01-01T00:00:00',
      '2026-04-01T00:00:00',
    );
    const after = await snapshot(
      shifts,
      '2026-01-01T00:00:00',
      '2026-02-01T00:00:00',
      '2026-01',
      undefined,
      { originalEndsAt: at('2026-04-01T00:00:00') },
    );
    expect(after.sourceFingerprint).toBe(before.sourceFingerprint);
    expect(after.netCents).toBe(before.netCents);
  });
  it('invalidates the affected month after leave is shortened', async () => {
    const before = await snapshot(
      shifts,
      '2026-01-01T00:00:00',
      '2026-04-01T00:00:00',
    );
    const after = await snapshot(
      shifts,
      '2026-01-01T00:00:00',
      '2026-01-15T00:00:00',
      '2026-01',
      undefined,
      { originalEndsAt: at('2026-04-01T00:00:00') },
    );
    expect(after.sourceFingerprint).not.toBe(before.sourceFingerprint);
    expect(before.netCents).toBe('0');
    expect(after.grossCents).toBe('192000');
  });
});
