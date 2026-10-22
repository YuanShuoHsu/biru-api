import { loadMedicalLedger } from '../attendance/medical-leave.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { calculatePayroll } from './payroll-calculation.js';
import type { PayrollEarningsService } from './payroll-earnings.service.js';
import type { PayrollRulesService } from './payroll-rules.service.js';
import { PayrollService } from './payroll.service.js';

vi.mock('./payroll-calculation.js', async () => ({
  ...(await vi.importActual<typeof import('./payroll-calculation.js')>(
    './payroll-calculation.js',
  )),
  calculatePayroll: vi.fn(() => ({ blockers: [], violations: [] })),
}));
vi.mock('../attendance/medical-leave.js', async () => ({
  ...(await vi.importActual<typeof import('../attendance/medical-leave.js')>(
    '../attendance/medical-leave.js',
  )),
  loadMedicalLedger: vi.fn(),
}));
const at = (hour: string) => new Date(`2026-01-15T${hour}:00:00+08:00`);

async function calculate(withShift: boolean, salaryType = 'monthly') {
  const employee = {
    id: 'employee',
    organizationId: 'org',
    hiredAt: new Date('2020-01-01'),
    terminatedAt: null,
    weeklyMinutes: 2400,
    pregnancyPeriods: [],
    nursingPeriods: [],
    childcareReductionPeriods: [],
    indigenousHolidays: [],
  };
  const shift = {
    id: 'shift',
    startsAt: at('09'),
    endsAt: at('17'),
    dayKind: 'workday',
    paidBreak: false,
  };
  const request = {
    id: 'leave',
    startsAt: at('00'),
    endsAt: new Date('2026-01-16T00:00:00+08:00'),
    kind: 'leave',
    status: 'approved',
    leaveTypeId: 'medical',
    shiftId: null,
  };
  const shifts = withShift ? [shift] : [];
  const results: unknown[][] = [
    [],
    [
      {
        terms: {
          salaryType,
          salaryCents: '4800000',
          allowanceCents: '0',
          monthlyProration: 'thirtyDays',
        },
      },
    ],
    shifts,
    ...(withShift ? [[]] : []),
    [request],
    [{ id: 'medical', statutoryKind: 'hospitalSick' }],
  ];
  const db = {
    select: () => {
      const result = Promise.resolve(results.shift() ?? []);
      const query: Record<string, unknown> = { then: result.then.bind(result) };
      for (const key of ['from', 'innerJoin', 'where', 'orderBy', 'limit'])
        query[key] = () => query;
      return query;
    },
  };
  vi.mocked(loadMedicalLedger).mockResolvedValue({
    segments: [
      {
        requestId: request.id,
        kind: 'hospitalSick',
        start: at('00').getTime(),
        end: at('12').getTime(),
        units: 0.5,
        calendar: true,
        paidFraction: 0.5,
        year: 2026,
      },
      {
        requestId: request.id,
        kind: 'hospitalSick',
        start: at('12').getTime(),
        end: request.endsAt.getTime(),
        units: 0.5,
        calendar: true,
        paidFraction: 0,
        year: 2026,
      },
    ],
    records: [],
    shifts: [],
    years: new Map(),
  });
  const service = new PayrollService(
    db as unknown as DrizzleDB,
    {
      resolve: () =>
        Promise.resolve({ rules: {}, ruleVersion: 'test', unconfirmed: [] }),
    } as unknown as PayrollRulesService,
    {} as unknown as PayrollEarningsService,
  );
  const snapshot = Reflect.get(service, 'snapshot') as (
    ...args: unknown[]
  ) => Promise<unknown>;
  await snapshot.call(
    service,
    db,
    { organizationId: 'org', userId: 'owner', role: 'owner' },
    employee.id,
    '2026-01',
    employee,
  );
  return vi.mocked(calculatePayroll).mock.calls.at(-1)?.[3];
}

describe('Calendar medical leave payroll', () => {
  beforeEach(() => vi.clearAllMocks());
  it('deducts six hours for a half-paid morning and unpaid afternoon regardless of the scheduled shift', async () => {
    expect(await calculate(true)).toBe(6 * 3600);
    expect(await calculate(false)).toBe(6 * 3600);
  });
  it('retains hourly wage deductions based on actual scheduled hours', async () => {
    expect(await calculate(true, 'hourly')).toBe(6.5 * 3600);
  });
});
