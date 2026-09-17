import type {
  PayrollTerms,
  TaiwanInsurance,
  TaiwanRuleSet,
} from 'src/db/schema/payroll';

const BP = 10000n;

const wholeDollars = (numerator: bigint, denominator: bigint) =>
  ((numerator + denominator / 2n) / denominator) * 100n;

export const insuranceGrade = (wage: number, grades: number[]) =>
  grades.find((grade) => grade >= wage) ?? grades[grades.length - 1];

export const laborGradesFor = (
  rules: TaiwanRuleSet,
  insurance: TaiwanInsurance,
) =>
  insurance.laborLadder === 'partTime'
    ? rules.partTimeLaborGrades
    : rules.laborGrades;

export const currentGrade = (basis: number, grades: number[]) =>
  basis <= 0 || insuranceGrade(basis, grades) === basis;

export function taiwanDeductions(
  rules: TaiwanRuleSet,
  terms: PayrollTerms,
  taxableCents: bigint,
  coverageDays = 30,
  healthCharged = true,
) {
  const insurance = terms.insurance;
  if (!insurance) return terms;
  const laborBasis = BigInt(insurance.laborBasis);
  const laborShare = BigInt(rules.laborEmployeeShareBp) * BigInt(coverageDays);
  const labor = ['both', 'labor'].includes(insurance.laborCoverage)
    ? wholeDollars(
        laborBasis * BigInt(rules.laborPercentBp) * laborShare,
        BP * BP * 30n,
      )
    : 0n;
  const employment = ['both', 'employment'].includes(insurance.laborCoverage)
    ? wholeDollars(
        laborBasis * BigInt(rules.employmentPercentBp) * laborShare,
        BP * BP * 30n,
      )
    : 0n;
  const health =
    wholeDollars(
      BigInt(insurance.healthBasis) *
        BigInt(rules.healthPercentBp) *
        BigInt(rules.healthEmployeeShareBp),
      BP * BP,
    ) * BigInt(healthCharged ? 1 + Math.min(insurance.healthDependents, 3) : 0);
  const voluntary = wholeDollars(
    BigInt(insurance.pensionBasis) *
      BigInt(insurance.voluntaryPercent) *
      BigInt(coverageDays),
    100n * 30n,
  );
  const employer = wholeDollars(
    BigInt(insurance.pensionBasis) *
      BigInt(insurance.employerPercent) *
      BigInt(coverageDays),
    100n * 30n,
  );
  const taxable = taxableCents > voluntary ? taxableCents - voluntary : 0n;
  const rate = BigInt(rules.withholdingRateBp);
  const tax =
    taxable * rate <= BigInt(rules.withholdingExemptTaxCents) * BP
      ? 0n
      : wholeDollars(taxable * rate, BP * 100n);
  return {
    ...terms,
    laborInsuranceCents: (labor + employment).toString(),
    healthInsuranceCents: health.toString(),
    voluntaryPensionCents: voluntary.toString(),
    employerPensionCents: employer.toString(),
    withholdingCents:
      insurance.taxMethod === 'resident5'
        ? tax.toString()
        : terms.withholdingCents,
  };
}
