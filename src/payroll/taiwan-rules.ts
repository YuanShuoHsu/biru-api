import { workPermitRequired } from 'src/attendance/attendance-rules';
import type { AttendanceLegalStatus } from 'src/db/schema/attendance';
import type {
  PayrollTerms,
  TaiwanInsurance,
  TaiwanRuleSet,
} from 'src/db/schema/payroll';

export const MINIMUM_EMPLOYER_PENSION_PERCENT = 6;

export const HEALTH_INSURANCE_WEEKLY_MINUTES = 12 * 60;

export const LABOR_INSURANCE_MANDATORY_HEADCOUNT = 5;

const MINIMUM_INSURABLE_AGE = 15;

const MAXIMUM_INSURABLE_AGE = 65;

export const employmentInsuranceEligible = (
  legalStatus: AttendanceLegalStatus,
) => legalStatus === 'national' || legalStatus === 'spouse';

export const pensionApplicable = (legalStatus: AttendanceLegalStatus) =>
  legalStatus !== 'foreignStudent' && legalStatus !== 'otherForeigner';

export const legalStatusObligations = (legalStatus: AttendanceLegalStatus) => ({
  employmentInsuranceEligible: employmentInsuranceEligible(legalStatus),
  pensionApplicable: pensionApplicable(legalStatus),
  workPermitRequired: workPermitRequired(legalStatus),
});

export const insuranceViolations = (
  insurance: TaiwanInsurance,
  {
    age,
    headcount,
    legalStatus,
    weeklyMinutes,
    worksEveryBusinessDay = false,
  }: {
    age: number | null;
    headcount: number;
    legalStatus: AttendanceLegalStatus;
    weeklyMinutes: number;
    worksEveryBusinessDay?: boolean;
  },
) => {
  const violations: (
    | 'employmentInsuranceExemptionInvalid'
    | 'employmentInsuranceIneligible'
    | 'employmentInsuranceRequired'
    | 'healthInsuranceExemptionInvalid'
    | 'healthInsuranceRequired'
    | 'laborInsuranceExemptionInvalid'
    | 'laborInsuranceRequired'
    | 'pensionIneligible'
    | 'pensionRequired'
  )[] = [];
  const insurableAge =
    age === null ||
    (age >= MINIMUM_INSURABLE_AGE && age <= MAXIMUM_INSURABLE_AGE);
  const laborCovered = ['both', 'labor'].includes(insurance.laborCoverage);
  if (insurance.laborInsuranceExemption && laborCovered)
    violations.push('laborInsuranceExemptionInvalid');
  if (
    headcount >= LABOR_INSURANCE_MANDATORY_HEADCOUNT &&
    insurableAge &&
    !laborCovered &&
    !insurance.laborInsuranceExemption
  )
    violations.push('laborInsuranceRequired');
  const healthCovered = insurance.healthBasis > 0;
  if (insurance.healthInsuranceExemption && healthCovered)
    violations.push('healthInsuranceExemptionInvalid');
  if (
    (weeklyMinutes >= HEALTH_INSURANCE_WEEKLY_MINUTES ||
      worksEveryBusinessDay) &&
    !healthCovered &&
    !insurance.healthInsuranceExemption
  )
    violations.push('healthInsuranceRequired');
  const eligible = employmentInsuranceEligible(legalStatus) && insurableAge;
  const covered = ['both', 'employment'].includes(insurance.laborCoverage);
  if (insurance.employmentInsuranceExemption && (covered || !eligible))
    violations.push('employmentInsuranceExemptionInvalid');
  if (eligible && !covered && !insurance.employmentInsuranceExemption)
    violations.push('employmentInsuranceRequired');
  if (!eligible && covered) violations.push('employmentInsuranceIneligible');
  if (!pensionApplicable(legalStatus)) {
    if (
      insurance.employerPercent > 0 ||
      insurance.voluntaryPercent > 0 ||
      insurance.pensionBasis > 0
    )
      violations.push('pensionIneligible');
  } else if (
    insurance.employerPercent < MINIMUM_EMPLOYER_PENSION_PERCENT ||
    insurance.pensionBasis <= 0
  )
    violations.push('pensionRequired');
  return violations;
};

const BP = 10000n;

const wholeDollars = (numerator: bigint, denominator: bigint) =>
  ((numerator + denominator / 2n) / denominator) * 100n;

export const insuranceGrade = (wage: number, grades: number[]) =>
  grades.find((grade) => grade >= wage) ?? grades[grades.length - 1];

export const laborGradesFor = (
  rules: TaiwanRuleSet,
  insurance: Pick<TaiwanInsurance, 'laborLadder'>,
) =>
  insurance.laborLadder === 'partTime'
    ? rules.partTimeLaborGrades
    : rules.laborGrades;

export interface TaiwanInsuranceInput extends Pick<
  TaiwanInsurance,
  | 'laborInsuranceExemption'
  | 'healthInsuranceExemption'
  | 'employmentInsuranceExemption'
  | 'manualPremiums'
  | 'healthDependents'
  | 'voluntaryPercent'
  | 'employerPercent'
  | 'taxMethod'
> {
  healthInsured: boolean;
  voluntaryLaborInsurance: boolean;
}

export const deriveInsurance = (
  rules: TaiwanRuleSet,
  { healthInsured, voluntaryLaborInsurance, ...input }: TaiwanInsuranceInput,
  {
    age,
    fullTime,
    headcount,
    legalStatus,
    referenceWage,
  }: {
    age: number | null;
    fullTime: boolean;
    headcount: number;
    legalStatus: AttendanceLegalStatus;
    referenceWage: number;
  },
): TaiwanInsurance => {
  const insurableAge =
    age === null ||
    (age >= MINIMUM_INSURABLE_AGE && age <= MAXIMUM_INSURABLE_AGE);
  const labor =
    insurableAge &&
    !input.laborInsuranceExemption &&
    (headcount >= LABOR_INSURANCE_MANDATORY_HEADCOUNT ||
      voluntaryLaborInsurance);
  const employment =
    insurableAge &&
    employmentInsuranceEligible(legalStatus) &&
    !input.employmentInsuranceExemption;
  const laborLadder = fullTime ? 'general' : 'partTime';
  const pension = pensionApplicable(legalStatus);

  return {
    ...input,
    laborCoverage:
      labor && employment
        ? 'both'
        : labor
          ? 'labor'
          : employment
            ? 'employment'
            : 'none',
    laborLadder,
    laborBasis:
      labor || employment
        ? insuranceGrade(referenceWage, laborGradesFor(rules, { laborLadder }))
        : 0,
    occupationalBasis: insuranceGrade(referenceWage, rules.occupationalGrades),
    healthBasis: healthInsured
      ? insuranceGrade(referenceWage, rules.healthGrades)
      : 0,
    pensionBasis: pension
      ? insuranceGrade(referenceWage, rules.pensionGrades)
      : 0,
    employerPercent: pension ? input.employerPercent : 0,
    voluntaryPercent: pension ? input.voluntaryPercent : 0,
  };
};

export const currentGrade = (basis: number, grades: number[]) =>
  basis <= 0 || insuranceGrade(basis, grades) === basis;

const MICROS = 1000000n;

export function employerCosts(
  rules: TaiwanRuleSet,
  insurance: TaiwanInsurance,
  {
    contributionDays,
    healthCharged,
    occupationalAccidentRateMicros,
  }: {
    contributionDays: number;
    healthCharged: boolean;
    occupationalAccidentRateMicros: number;
  },
) {
  const days = BigInt(contributionDays);
  const laborBasis = BigInt(insurance.laborBasis);
  const laborCovered = ['both', 'labor'].includes(insurance.laborCoverage);
  const employmentCovered = ['both', 'employment'].includes(
    insurance.laborCoverage,
  );
  const laborShare = BigInt(rules.laborEmployerShareBp) * days;
  return [
    {
      code: 'laborInsurance' as const,
      amountCents: laborCovered
        ? wholeDollars(
            laborBasis * BigInt(rules.laborPercentBp) * laborShare,
            BP * BP * 30n,
          )
        : 0n,
    },
    {
      code: 'employmentInsurance' as const,
      amountCents: employmentCovered
        ? wholeDollars(
            laborBasis * BigInt(rules.employmentPercentBp) * laborShare,
            BP * BP * 30n,
          )
        : 0n,
    },
    {
      code: 'healthInsurance' as const,
      amountCents: healthCharged
        ? wholeDollars(
            BigInt(insurance.healthBasis) *
              BigInt(rules.healthPercentBp) *
              BigInt(rules.healthEmployerShareBp) *
              (BP + BigInt(rules.healthAverageDependentsBp)),
            BP * BP * BP,
          )
        : 0n,
    },
    {
      code: 'occupationalAccident' as const,
      amountCents: wholeDollars(
        BigInt(insurance.occupationalBasis) *
          BigInt(
            occupationalAccidentRateMicros + rules.commutingAccidentRateMicros,
          ) *
          days,
        MICROS * 30n,
      ),
    },
    {
      code: 'wageGuarantee' as const,
      amountCents: laborCovered
        ? wholeDollars(
            laborBasis * BigInt(rules.wageGuaranteeRateMicros) * days,
            MICROS * 30n,
          )
        : 0n,
    },
  ].map(({ amountCents, code }) => ({
    code,
    amountCents: amountCents.toString(),
  }));
}

const NON_RESIDENT_REDUCED_RATE_BP = 600n;

const NON_RESIDENT_RATE_BP = 1800n;

export function taiwanDeductions(
  rules: TaiwanRuleSet,
  terms: PayrollTerms,
  taxableCents: bigint,
  {
    coverageDays = 30,
    healthCharged = true,
    contributionDays = coverageDays,
    nonResident = false,
  }: {
    coverageDays?: number;
    healthCharged?: boolean;
    contributionDays?: number;
    nonResident?: boolean;
  } = {},
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
      BigInt(contributionDays),
    100n * 30n,
  );
  const employer = wholeDollars(
    BigInt(insurance.pensionBasis) *
      BigInt(insurance.employerPercent) *
      BigInt(contributionDays),
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
    laborInsuranceCents: insurance.manualPremiums
      ? terms.laborInsuranceCents
      : (labor + employment).toString(),
    healthInsuranceCents: insurance.manualPremiums
      ? terms.healthInsuranceCents
      : health.toString(),
    voluntaryPensionCents: voluntary.toString(),
    employerPensionCents: employer.toString(),
    withholdingCents: nonResident
      ? wholeDollars(
          taxable *
            (taxable * 2n <= BigInt(rules.minimumMonthlyWageCents) * 3n
              ? NON_RESIDENT_REDUCED_RATE_BP
              : NON_RESIDENT_RATE_BP),
          BP * 100n,
        ).toString()
      : insurance.taxMethod === 'resident5'
        ? tax.toString()
        : terms.withholdingCents,
  };
}
