import type { PayrollTerms } from 'src/db/schema/payroll';

import {
  currentGrade,
  insuranceGrade,
  laborGradesFor,
  taiwanDeductions,
} from './taiwan-rules';
import { taiwan2026 } from './taiwan-rules.fixture';

const terms: PayrollTerms = {
  salaryType: 'monthly',
  salaryCents: '2950000',
  laborInsuranceCents: '0',
  healthInsuranceCents: '0',
  voluntaryPensionCents: '0',
  employerPensionCents: '0',
  withholdingCents: '0',
  allowanceCents: '0',
  otherDeductionCents: '0',
  sourceNote: '2026 official tables',
  insurance: {
    laborCoverage: 'both',
    laborBasis: 29500,
    healthBasis: 29500,
    healthDependents: 0,
    pensionBasis: 29500,
    voluntaryPercent: 0,
    employerPercent: 6,
    taxMethod: 'resident5',
  },
};
describe('Taiwan 2026 contributions', () => {
  it('matches the NHI 29500 grade and caps dependents at three', () => {
    expect(
      taiwanDeductions(taiwan2026, terms, 2950000n).healthInsuranceCents,
    ).toBe('45800');
    expect(
      taiwanDeductions(
        taiwan2026,
        { ...terms, insurance: { ...terms.insurance!, healthDependents: 4 } },
        2950000n,
      ).healthInsuranceCents,
    ).toBe('183200');
  });
  it('separates labor and employment rounding and employer pension', () => {
    const result = taiwanDeductions(taiwan2026, terms, 2950000n);
    expect(result.laborInsuranceCents).toBe('73800');
    expect(result.employerPensionCents).toBe('177000');
    expect(result.withholdingCents).toBe('0');
  });
  it('applies the elected resident 5% rate and verified withholding mode', () => {
    expect(taiwanDeductions(taiwan2026, terms, 6000000n).withholdingCents).toBe(
      '300000',
    );
    expect(
      taiwanDeductions(
        taiwan2026,
        {
          ...terms,
          withholdingCents: '123400',
          insurance: { ...terms.insurance!, taxMethod: 'verified' },
        },
        6000000n,
      ).withholdingCents,
    ).toBe('123400');
  });
});

describe('Insurance grade ladders', () => {
  it('maps a wage up to the covering grade and caps at the ceiling', () => {
    expect(insuranceGrade(29500, taiwan2026.laborGrades)).toBe(29500);
    expect(insuranceGrade(29501, taiwan2026.laborGrades)).toBe(30300);
    expect(insuranceGrade(120000, taiwan2026.laborGrades)).toBe(45800);
    expect(insuranceGrade(120000, taiwan2026.healthGrades)).toBe(120900);
    expect(insuranceGrade(999999, taiwan2026.healthGrades)).toBe(313000);
  });
  it('does not accept a superseded grade such as the 2025 floor', () => {
    expect(insuranceGrade(28590, taiwan2026.laborGrades)).not.toBe(28590);
  });
  it('accepts only an exact grade of the ladder, or an uninsured zero', () => {
    expect(currentGrade(0, taiwan2026.laborGrades)).toBe(true);
    expect(currentGrade(0, taiwan2026.healthGrades)).toBe(true);
    expect(currentGrade(29500, taiwan2026.laborGrades)).toBe(true);
    expect(currentGrade(30000, taiwan2026.laborGrades)).toBe(false);
    expect(currentGrade(28590, taiwan2026.laborGrades)).toBe(false);
    expect(currentGrade(50000, taiwan2026.laborGrades)).toBe(false);
    expect(currentGrade(45800, taiwan2026.laborGrades)).toBe(true);
  });
  it('uses the part-time labor ladder only for part-time insureds', () => {
    const insurance = terms.insurance!;
    const general = laborGradesFor(taiwan2026, insurance);
    const partTime = laborGradesFor(taiwan2026, {
      ...insurance,
      laborLadder: 'partTime',
    });
    expect(currentGrade(11100, general)).toBe(false);
    expect(currentGrade(11100, partTime)).toBe(true);
    expect(currentGrade(28590, partTime)).toBe(true);
    expect(currentGrade(12000, partTime)).toBe(false);
    expect(partTime[partTime.length - 1]).toBe(45800);
  });
});
