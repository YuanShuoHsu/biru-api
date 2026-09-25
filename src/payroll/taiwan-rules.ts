import { workPermitRequired } from 'src/attendance/attendance-rules';
import type { AttendanceLegalStatus } from 'src/db/schema/attendance';
import type {
  TaiwanInsurance,
  TaiwanRuleSet,
  WithholdingTable,
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
    | 'healthSupplementExemptionInvalid'
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
  if (insurance.healthSupplementExemption && healthCovered)
    violations.push('healthSupplementExemptionInvalid');
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
  | 'healthSupplementExemption'
  | 'healthDependents'
  | 'voluntaryPercent'
  | 'employerPercent'
  | 'taxMethod'
  | 'withholdingDependents'
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

const HEALTH_SUPPLEMENT_CAP_CENTS = 1000000000n;

const WITHHOLDING_TABLE_STEP_CENTS = 50000n;

const WITHHOLDING_TABLE_MAX_CENTS = 50000000n;

const WITHHOLDING_TABLE_MAX_DEPENDENTS = 11;

const annualTax = (taxable: bigint, table: WithholdingTable) => {
  let tax = 0n;
  let floor = 0n;
  for (const { upTo, rateBp } of table.brackets) {
    const ceiling = upTo === null ? taxable : BigInt(upTo) * 100n;
    if (taxable > floor)
      tax += ((taxable < ceiling ? taxable : ceiling) - floor) * BigInt(rateBp);
    floor = ceiling;
  }
  return tax / BP;
};

export function tableWithholding(
  table: WithholdingTable,
  monthlyCents: bigint,
  dependents: number,
) {
  const tabulated =
    monthlyCents <= WITHHOLDING_TABLE_MAX_CENTS &&
    dependents <= WITHHOLDING_TABLE_MAX_DEPENDENTS;
  // 表列區間一律以下限計算並捨去至十元，才會和財政部公告的扣繳稅額表逐格相同
  const salary = tabulated
    ? monthlyCents <= 0n
      ? 0n
      : ((monthlyCents - 1n) / WITHHOLDING_TABLE_STEP_CENTS) *
          WITHHOLDING_TABLE_STEP_CENTS +
        100n
    : monthlyCents;
  const deductions =
    BigInt(table.exemption * (1 + dependents) + table.standardDeduction) *
      100n +
    (salary * 12n < BigInt(table.salaryDeduction) * 100n
      ? salary * 12n
      : BigInt(table.salaryDeduction) * 100n);
  const taxable = salary * 12n - deductions;
  if (taxable <= 0n) return 0n;
  const monthly = annualTax(taxable, table) / 12n;
  return tabulated ? (monthly / 1000n) * 1000n : (monthly / 100n) * 100n;
}

export interface TaiwanDeductions {
  laborInsuranceCents: string;
  healthInsuranceCents: string;
  healthSupplementCents: string;
  voluntaryPensionCents: string;
  employerPensionCents: string;
  withholdingCents: string;
}

const NO_DEDUCTIONS: TaiwanDeductions = {
  laborInsuranceCents: '0',
  healthInsuranceCents: '0',
  healthSupplementCents: '0',
  voluntaryPensionCents: '0',
  employerPensionCents: '0',
  withholdingCents: '0',
};

export function taiwanDeductions(
  rules: TaiwanRuleSet,
  insurance: TaiwanInsurance | undefined,
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
): TaiwanDeductions {
  if (!insurance) return NO_DEDUCTIONS;
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
  const supplementBase =
    taxable < HEALTH_SUPPLEMENT_CAP_CENTS
      ? taxable
      : HEALTH_SUPPLEMENT_CAP_CENTS;
  const supplement =
    insurance.healthBasis === 0 &&
    !insurance.healthSupplementExemption &&
    taxable >= BigInt(rules.minimumMonthlyWageCents)
      ? wholeDollars(
          supplementBase * BigInt(rules.healthSupplementRateBp),
          BP * 100n,
        )
      : 0n;
  const exemptTax = BigInt(rules.withholdingExemptTaxCents);
  const tableTax = () => {
    const tax = tableWithholding(
      rules.withholdingTable,
      taxable,
      insurance.withholdingDependents,
    );
    return tax <= exemptTax ? 0n : tax;
  };
  const tax = nonResident
    ? wholeDollars(
        taxable *
          (taxable * 2n <= BigInt(rules.minimumMonthlyWageCents) * 3n
            ? NON_RESIDENT_REDUCED_RATE_BP
            : NON_RESIDENT_RATE_BP),
        BP * 100n,
      )
    : insurance.taxMethod === 'table'
      ? tableTax()
      : taxable * BigInt(rules.withholdingRateBp) <= exemptTax * BP
        ? 0n
        : wholeDollars(taxable * BigInt(rules.withholdingRateBp), BP * 100n);
  return {
    laborInsuranceCents: (labor + employment).toString(),
    healthInsuranceCents: health.toString(),
    healthSupplementCents: supplement.toString(),
    voluntaryPensionCents: voluntary.toString(),
    employerPensionCents: employer.toString(),
    withholdingCents: tax.toString(),
  };
}
