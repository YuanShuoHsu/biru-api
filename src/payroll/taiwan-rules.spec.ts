import type { TaiwanInsurance } from 'src/db/schema/payroll';

import {
  currentGrade,
  insuranceGrade,
  laborGradesFor,
  tableWithholding,
  taiwanDeductions,
} from './taiwan-rules';
import { taiwan2026 } from './taiwan-rules.fixture';

const insurance: TaiwanInsurance = {
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
};
describe('Taiwan 2026 contributions', () => {
  it('matches the NHI 29500 grade and caps dependents at three', () => {
    expect(
      taiwanDeductions(taiwan2026, insurance, 2950000n).healthInsuranceCents,
    ).toBe('45800');
    expect(
      taiwanDeductions(
        taiwan2026,
        { ...insurance, healthDependents: 4 },
        2950000n,
      ).healthInsuranceCents,
    ).toBe('183200');
  });
  it('separates labor and employment rounding and employer pension', () => {
    const result = taiwanDeductions(taiwan2026, insurance, 2950000n);
    expect(result.laborInsuranceCents).toBe('73800');
    expect(result.employerPensionCents).toBe('177000');
    expect(result.withholdingCents).toBe('0');
  });
  it('applies the elected resident 5% rate', () => {
    expect(
      taiwanDeductions(taiwan2026, insurance, 6000000n).withholdingCents,
    ).toBe('300000');
  });
  it('reproduces the 2026 salary withholding table cell by cell', () => {
    const table = taiwan2026.withholdingTable;
    const cell = (dollars: number, dependents: number) =>
      tableWithholding(table, BigInt(dollars) * 100n, dependents) / 100n;
    expect(cell(90500, 0)).toBe(2000n);
    expect(cell(90800, 0)).toBe(2020n);
    expect(cell(99001, 1)).toBe(2020n);
    expect(cell(101200, 0)).toBe(2560n);
    expect(cell(165600, 0)).toBe(10340n);
    expect(cell(281200, 0)).toBe(33450n);
    expect(cell(483400, 0)).toBe(94100n);
    expect(cell(500000, 2)).toBe(93970n);
    expect(cell(500000, 11)).toBe(71230n);
  });
  it('withholds by the table and exempts tax of 2,000 or less', () => {
    const table = { ...insurance, taxMethod: 'table' as const };
    expect(taiwanDeductions(taiwan2026, table, 9050000n).withholdingCents).toBe(
      '0',
    );
    expect(taiwanDeductions(taiwan2026, table, 9080000n).withholdingCents).toBe(
      '202000',
    );
  });
  it('withholds the part-time health supplement from pay of the minimum wage or more', () => {
    const uninsured = { ...insurance, healthBasis: 0 };
    expect(
      taiwanDeductions(taiwan2026, uninsured, 2949900n).healthSupplementCents,
    ).toBe('0');
    expect(
      taiwanDeductions(taiwan2026, uninsured, 3000000n).healthSupplementCents,
    ).toBe('63300');
    expect(
      taiwanDeductions(
        taiwan2026,
        { ...uninsured, healthSupplementExemption: 'secondCategory' },
        3000000n,
      ).healthSupplementCents,
    ).toBe('0');
    expect(
      taiwanDeductions(taiwan2026, insurance, 3000000n).healthSupplementCents,
    ).toBe('0');
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
