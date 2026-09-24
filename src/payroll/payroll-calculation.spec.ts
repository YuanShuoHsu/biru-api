import type { PayrollTerms } from 'src/db/schema/payroll';

import { calculatePayroll, payrollPeriod } from './payroll-calculation';
import { taiwan2026 } from './taiwan-rules.fixture';

const terms: PayrollTerms = {
  salaryType: 'hourly',
  salaryCents: '24000',
  laborInsuranceCents: '10000',
  healthInsuranceCents: '20000',
  voluntaryPensionCents: '0',
  employerPensionCents: '200000',
  withholdingCents: '0',
  allowanceCents: '0',
  otherDeductionCents: '0',
  sourceNote: 'Verified test fixture',
};
describe('Taiwan general payroll arithmetic', () => {
  it('computes ordinary overtime using exact rational arithmetic', () => {
    const result = calculatePayroll(
      taiwan2026,
      terms,
      [{ seconds: 10 * 3600, dayKind: 'workday' }],
      0,
    );
    expect(result.grossCents).toBe('256000');
    expect(result.netCents).toBe('226000');
    expect(result.employerPensionCents).toBe('200000');
  });
  it('calculates rest-day overtime and holiday work separately', () => {
    const rest = calculatePayroll(
      taiwan2026,
      terms,
      [{ seconds: 10 * 3600, dayKind: 'restDay' }],
      0,
    );
    expect(rest.grossCents).toBe('432000');
    const holiday = calculatePayroll(
      taiwan2026,
      { ...terms, salaryType: 'monthly', salaryCents: '5760000' },
      [{ seconds: 4 * 3600, dayKind: 'holiday' }],
      0,
    );
    expect(
      holiday.lines.find((line) => line.code === 'holidayPay')?.amountCents,
    ).toBe('192000');
  });
  it('does not deduct employer contributions from employee pay', () => {
    const result = calculatePayroll(
      taiwan2026,
      { ...terms, laborInsuranceCents: '0', healthInsuranceCents: '0' },
      [{ seconds: 8 * 3600, dayKind: 'workday' }],
      0,
    );
    expect(result.netCents).toBe(result.grossCents);
  });
  it('blocks unknown day classifications and negative net pay', () => {
    expect(
      calculatePayroll(
        taiwan2026,
        terms,
        [{ seconds: 3600, dayKind: 'unknown' }],
        0,
      ).blockers,
    ).toContain('unsupportedDayKind');
    expect(calculatePayroll(taiwan2026, terms, [], 0).blockers).toContain(
      'negativeNetPay',
    );
  });
  it('flags wages below the 2026 minimum and excessive hours', () => {
    const result = calculatePayroll(
      taiwan2026,
      { ...terms, salaryCents: '19500' },
      [{ seconds: 13 * 3600, dayKind: 'workday' }],
      0,
    );
    expect(result.blockers).toEqual(
      expect.arrayContaining(['belowMinimumWage', 'dailyHoursExceeded']),
    );
  });
});

describe('Taipei payroll periods', () => {
  it.each([
    ['2026-02', '2026-02-28T16:00:00.000Z'],
    ['2026-04', '2026-04-30T16:00:00.000Z'],
    ['2026-12', '2026-12-31T16:00:00.000Z'],
  ])('ends %s at the next local month boundary', (month, expected) => {
    expect(payrollPeriod(month).end.toISOString()).toBe(expected);
  });
});
