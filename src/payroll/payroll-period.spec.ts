import type { PayrollTerms } from 'src/db/schema/payroll';

import { calculatePayroll, payrollPeriod } from './payroll-calculation';
import { employmentPeriod, periodWork } from './payroll-period';
import { taiwan2026 } from './taiwan-rules.fixture';

const terms: PayrollTerms = {
  salaryType: 'hourly',
  salaryCents: '24000',
  allowanceCents: '0',
  laborInsuranceCents: '0',
  healthInsuranceCents: '0',
  voluntaryPensionCents: '0',
  employerPensionCents: '0',
  withholdingCents: '0',
  otherDeductionCents: '0',
  sourceNote: 'test',
};
describe('Cross-month attendance', () => {
  it('allocates a 12-hour overnight shift once and preserves overtime tiers', () => {
    const intervals = [
      {
        start: Date.parse('2026-01-31T18:00:00+08:00'),
        end: Date.parse('2026-02-01T06:00:00+08:00'),
      },
    ];
    const calculate = (month: string) => {
      const { start, end } = payrollPeriod(month);
      return calculatePayroll(
        taiwan2026,
        terms,
        [{ dayKind: 'workday', ...periodWork(intervals, start, end) }],
        0,
      );
    };
    const january = calculate('2026-01'),
      february = calculate('2026-02');
    expect(january.workedSeconds + february.workedSeconds).toBe(12 * 3600);
    expect(january.grossCents).toBe('144000');
    expect(february.grossCents).toBe('192000');
    expect(BigInt(january.grossCents) + BigInt(february.grossCents)).toBe(
      BigInt(
        calculatePayroll(
          taiwan2026,
          terms,
          [{ dayKind: 'workday', seconds: 12 * 3600 }],
          0,
        ).grossCents,
      ),
    );
  });
  it('does not grant holiday base entitlement twice across months', () => {
    const january = calculatePayroll(
      taiwan2026,
      terms,
      [
        {
          dayKind: 'holiday',
          seconds: 6 * 3600,
          totalSeconds: 12 * 3600,
          scheduledSeconds: 6 * 3600,
        },
      ],
      0,
    );
    const february = calculatePayroll(
      taiwan2026,
      terms,
      [
        {
          dayKind: 'holiday',
          seconds: 6 * 3600,
          offsetSeconds: 6 * 3600,
          totalSeconds: 12 * 3600,
          scheduledSeconds: 6 * 3600,
          scheduledOffsetSeconds: 6 * 3600,
        },
      ],
      0,
    );
    const whole = calculatePayroll(
      taiwan2026,
      terms,
      [{ dayKind: 'holiday', seconds: 12 * 3600, scheduledSeconds: 12 * 3600 }],
      0,
    );
    expect(BigInt(january.grossCents) + BigInt(february.grossCents)).toBe(
      BigInt(whole.grossCents),
    );
  });
  it('includes monthly hourly-worker allowances in the overtime rate', () => {
    const result = calculatePayroll(
      taiwan2026,
      { ...terms, allowanceCents: '160000', allowanceHours: 160 },
      [{ seconds: 10 * 3600, dayKind: 'workday' }],
      0,
    );
    expect(
      result.lines.find((line) => line.code === 'overtimePay')?.amountCents,
    ).toBe('66667');
    expect(result.blockers).not.toContain('hourlyAllowanceBasisRequired');
  });
});

describe('Millisecond punch precision', () => {
  it('keeps period seconds integral so the BigInt pay maths holds', () => {
    const { start, end } = payrollPeriod('2026-01');
    const intervals = [
      {
        start: Date.parse('2026-01-05T09:00:00.123+08:00'),
        end: Date.parse('2026-01-05T18:00:00.456+08:00'),
      },
    ];
    const work = periodWork(intervals, start, end);
    expect(Object.values(work).every(Number.isInteger)).toBe(true);
    expect(() =>
      calculatePayroll(taiwan2026, terms, [{ dayKind: 'workday', ...work }], 0),
    ).not.toThrow();
  });
  it('splits an overnight shift punched with milliseconds without fractions', () => {
    const intervals = [
      {
        start: Date.parse('2026-01-31T18:00:00.700+08:00'),
        end: Date.parse('2026-02-01T06:00:00.200+08:00'),
      },
    ];
    for (const month of ['2026-01', '2026-02']) {
      const { start, end } = payrollPeriod(month);
      const work = periodWork(intervals, start, end);
      expect(Object.values(work).every(Number.isInteger)).toBe(true);
      expect(() =>
        calculatePayroll(
          taiwan2026,
          terms,
          [{ dayKind: 'workday', ...work }],
          0,
        ),
      ).not.toThrow();
    }
  });
});

describe('Employment proration', () => {
  it('keeps a full February salary whole and counts insurance as 30 days', () => {
    const { start, end } = payrollPeriod('2026-02');
    expect(
      employmentPeriod(start, end, new Date('2020-01-01'), null, 'thirtyDays'),
    ).toMatchObject({
      numerator: 1,
      denominator: 1,
      coverageDays: 30,
      healthCharged: true,
    });
  });
  it('supports both explicitly agreed salary methods and prorates insurance independently', () => {
    const { start, end } = payrollPeriod('2026-02');
    const hire = new Date('2026-02-16T00:00:00+08:00');
    expect(
      employmentPeriod(start, end, hire, null, 'thirtyDays'),
    ).toMatchObject({ numerator: 13, denominator: 30, coverageDays: 15 });
    expect(
      employmentPeriod(start, end, hire, null, 'calendarDays'),
    ).toMatchObject({ numerator: 13, denominator: 28, coverageDays: 15 });
  });
  it('does not charge NHI when employment ends before month-end', () => {
    const { start, end } = payrollPeriod('2026-03');
    expect(
      employmentPeriod(
        start,
        end,
        new Date('2020-01-01'),
        new Date('2026-03-16T00:00:00+08:00'),
        'thirtyDays',
      ),
    ).toMatchObject({
      numerator: 15,
      denominator: 30,
      coverageDays: 15,
      healthCharged: false,
    });
  });
});
