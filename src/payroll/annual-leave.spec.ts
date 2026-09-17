import type { PayrollTerms } from 'src/db/schema/payroll';

import { annualLeaveSettlement } from './annual-leave';

const terms: PayrollTerms = {
  salaryType: 'monthly',
  salaryCents: '4800000',
  allowanceCents: '0',
  laborInsuranceCents: '0',
  healthInsuranceCents: '0',
  voluntaryPensionCents: '0',
  employerPensionCents: '0',
  withholdingCents: '0',
  otherDeductionCents: '0',
  sourceNote: 'test',
};

const input = {
  hiredAt: new Date('2020-07-01T00:00:00+08:00'),
  terminatedAt: null,
  weeklyMinutesAt: () => 2400,
  start: new Date('2026-07-01T00:00:00+08:00'),
  end: new Date('2026-08-01T00:00:00+08:00'),
  terms,
  leaves: [{ startsAt: new Date('2026-01-10'), leaveMinutes: 480 }],
};
describe('Unused annual leave settlement', () => {
  it('pays only the expired entitlement less approved leave', () => {
    const result = annualLeaveSettlement(input);
    expect(result.settlements).toHaveLength(1);
    expect(result.settlements[0].unusedMinutes).toBe(14 * 480);
    expect(result.amountCents).toBe('2240000');
  });
  it('does not pay the same entitlement in the following month', () => {
    expect(
      annualLeaveSettlement({
        ...input,
        start: input.end,
        end: new Date('2026-09-01T00:00:00+08:00'),
      }).amountCents,
    ).toBe('0');
  });
  it('settles the current entitlement when employment ends mid-year', () => {
    expect(
      annualLeaveSettlement({
        ...input,
        terminatedAt: new Date('2026-03-15T18:00:00+08:00'),
        start: new Date('2026-03-01T00:00:00+08:00'),
        end: new Date('2026-04-01T00:00:00+08:00'),
      }).amountCents,
    ).toBe('2240000');
  });
  it('keeps the entitlement granted at the period start when hours change later', () => {
    const raised = new Date('2026-01-01T00:00:00+08:00');
    const result = annualLeaveSettlement({
      ...input,
      leaves: [],
      weeklyMinutesAt: (at: Date) => (at < raised ? 1200 : 2400),
    });
    expect(result.settlements[0].unusedMinutes).toBe(15 * 480 * 0.5);
  });
});
