import { MAX_MONTHLY_OVERTIME_SECONDS } from 'src/attendance/attendance-rules';
import { platformMonthStart } from 'src/common/constants/timezone';
import {
  PAYROLL_DEDUCTION_LINE_CODES,
  PAYROLL_EARNING_LINE_CODES,
  type PayrollBlocker,
  type PayrollLine,
  type PayrollLineCode,
  type PayrollTerms,
  type TaiwanRuleSet,
} from 'src/db/schema/payroll';

import { employerCosts, taiwanDeductions } from './taiwan-rules';

export interface PayrollWorkDay {
  seconds: number;
  dayKind: string;
  scheduledSeconds?: number;
  scheduledOffsetSeconds?: number;
  paidLeaveSeconds?: number;
  parentalScheduledSeconds?: number;
  offsetSeconds?: number;
  totalSeconds?: number;
}

export const roundRatio = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / 2n) / denominator;

interface Ratio {
  numerator: bigint;
  denominator: bigint;
}

const ratio = (numerator: bigint, denominator = 1n): Ratio => ({
  numerator,
  denominator,
});

const addRatios = (...ratios: Ratio[]) =>
  ratios.reduce(
    (sum, item) =>
      ratio(
        sum.numerator * item.denominator + item.numerator * sum.denominator,
        sum.denominator * item.denominator,
      ),
    ratio(0n),
  );

const negateRatio = ({ numerator, denominator }: Ratio) =>
  ratio(-numerator, denominator);

const roundCents = ({ numerator, denominator }: Ratio) =>
  roundRatio(numerator, denominator);

const ceilDollars = ({ numerator, denominator }: Ratio) => {
  const scaled = denominator * 100n;
  const quotient = numerator / scaled;
  return (quotient * scaled < numerator ? quotient + 1n : quotient) * 100n;
};

export function hourlyRate(terms: PayrollTerms) {
  const salary = BigInt(terms.salaryCents);
  const allowance = BigInt(terms.allowanceCents);
  const hours = BigInt(terms.allowanceHours ?? 1);
  return terms.salaryType === 'monthly'
    ? { numerator: salary + allowance, denominator: 240n }
    : { numerator: salary * hours + allowance, denominator: hours };
}

export function calculatePayroll(
  rules: TaiwanRuleSet,
  terms: PayrollTerms,
  days: PayrollWorkDay[],
  leaveDeductionSeconds: number,
  fraction: {
    numerator: number;
    denominator: number;
    coverageDays?: number;
    healthCharged?: boolean;
    contributionDays?: number;
    employerHealthCharged?: boolean;
    nonResident?: boolean;
    occupationalAccidentRateMicros?: number | null;
    annualLeavePayoutCents?: string;
    calendarLeaveDeductionCents?: string;
    calendarLeavePayCents?: string;
    monthlyOvertimeLimitSeconds?: number;
    absenceSeconds?: number;
  } = { numerator: 1, denominator: 1 },
) {
  const salary = BigInt(terms.salaryCents);
  const allowance = BigInt(terms.allowanceCents);
  const { numerator: hourlyNumerator, denominator: hourlyDenominator } =
    hourlyRate(terms);
  const lines: PayrollLine[] = [];
  const blockers: PayrollBlocker[] = [];
  if (
    (terms.salaryType === 'monthly' ? salary + allowance : salary) <
    BigInt(
      terms.salaryType === 'monthly'
        ? rules.minimumMonthlyWageCents
        : rules.minimumHourlyWageCents,
    )
  )
    blockers.push('belowMinimumWage');
  if (terms.salaryType === 'hourly' && allowance > 0n && !terms.allowanceHours)
    blockers.push('hourlyAllowanceBasisRequired');
  let regularSeconds = 0,
    overtimeFirst = 0,
    overtimeSecond = 0,
    overtimeThird = 0,
    holidaySeconds = 0,
    emergencySeconds = 0,
    restOvertime = 0,
    ordinaryOvertime = 0,
    paidLeaveSeconds = 0;
  for (const day of days) {
    if (
      day.dayKind !== 'regularLeave' &&
      (day.totalSeconds ?? day.seconds) > 12 * 3600
    )
      blockers.push('dailyHoursExceeded');
    paidLeaveSeconds += day.paidLeaveSeconds ?? 0;
    const offset = day.offsetSeconds ?? 0;
    const band = (from: number, to: number) =>
      Math.max(0, Math.min(offset + day.seconds, to) - Math.max(offset, from));
    if (day.dayKind === 'restDay') {
      overtimeFirst += band(0, 2 * 3600);
      overtimeSecond += band(2 * 3600, 8 * 3600);
      overtimeThird += band(8 * 3600, 12 * 3600);
      restOvertime += day.seconds;
      continue;
    }
    if (day.dayKind === 'holiday' || day.dayKind === 'regularLeave') {
      if (terms.salaryType === 'monthly') {
        if (day.seconds > 0) {
          const total = day.totalSeconds ?? day.seconds;
          holidaySeconds +=
            Math.round((8 * 3600 * (offset + day.seconds)) / total) -
            Math.round((8 * 3600 * offset) / total);
        }
      } else {
        const scheduledOffset = day.scheduledOffsetSeconds ?? 0;
        const scheduledTo = Math.min(
          scheduledOffset + (day.scheduledSeconds ?? 0),
          8 * 3600,
        );
        const scheduledFrom = Math.min(scheduledOffset, 8 * 3600);
        regularSeconds += Math.max(
          0,
          scheduledTo - scheduledFrom - (day.parentalScheduledSeconds ?? 0),
        );
        if ((day.totalSeconds ?? day.seconds) > 0)
          holidaySeconds +=
            Math.max(scheduledTo, Math.min(offset + day.seconds, 8 * 3600)) -
            Math.max(scheduledFrom, Math.min(offset, 8 * 3600));
      }
    } else if (day.dayKind === 'workday') {
      regularSeconds += band(0, 8 * 3600);
      ordinaryOvertime += band(8 * 3600, Infinity);
    } else blockers.push('unsupportedDayKind');
    if (day.dayKind === 'regularLeave') {
      emergencySeconds += band(8 * 3600, Infinity);
      continue;
    }
    overtimeFirst += band(8 * 3600, 10 * 3600);
    overtimeSecond += band(10 * 3600, 12 * 3600);
  }
  if (
    ordinaryOvertime + restOvertime >
    (fraction.monthlyOvertimeLimitSeconds ?? MAX_MONTHLY_OVERTIME_SECONDS)
  )
    blockers.push('monthlyOvertimeExceeded');
  const exactRegular =
    terms.salaryType === 'monthly'
      ? ratio(salary * BigInt(fraction.numerator), BigInt(fraction.denominator))
      : ratio(salary * BigInt(regularSeconds + paidLeaveSeconds), 3600n);
  const exactAllowance = ratio(
    allowance * BigInt(fraction.numerator),
    BigInt(fraction.denominator),
  );
  const exactOvertime = ratio(
    hourlyNumerator *
      (BigInt(overtimeFirst) * 4n +
        BigInt(overtimeSecond) * 5n +
        BigInt(overtimeThird) * 8n +
        BigInt(emergencySeconds) * 6n),
    hourlyDenominator * 3600n * 3n,
  );
  const exactHolidayPay = ratio(
    hourlyNumerator * BigInt(holidaySeconds),
    hourlyDenominator * 3600n,
  );
  const exactLeaveDeduction = addRatios(
    ratio(BigInt(fraction.calendarLeaveDeductionCents ?? '0')),
    ratio(
      terms.salaryType === 'monthly'
        ? hourlyNumerator * BigInt(leaveDeductionSeconds)
        : 0n,
      hourlyDenominator * 3600n,
    ),
  );
  const absenceSeconds =
    terms.salaryType === 'monthly' ? (fraction.absenceSeconds ?? 0) : 0;
  const exactAbsenceDeduction = ratio(
    hourlyNumerator * BigInt(absenceSeconds),
    hourlyDenominator * 3600n,
  );
  const regular = roundCents(exactRegular);
  const paidAllowance = roundCents(exactAllowance);
  const overtime = roundCents(exactOvertime);
  const holidayPay = roundCents(exactHolidayPay);
  const calendarLeavePay = BigInt(fraction.calendarLeavePayCents ?? '0');
  const annualLeavePay = BigInt(fraction.annualLeavePayoutCents ?? '0');
  const leaveDeduction = roundCents(exactLeaveDeduction);
  const absenceDeduction = roundCents(exactAbsenceDeduction);
  lines.push(
    {
      code: 'basePay',
      amountCents: regular.toString(),
      seconds: regularSeconds,
    },
    {
      code: 'overtimePay',
      amountCents: overtime.toString(),
      seconds:
        overtimeFirst + overtimeSecond + overtimeThird + emergencySeconds,
    },
    {
      code: 'holidayPay',
      amountCents: holidayPay.toString(),
      seconds: holidaySeconds,
    },
    { code: 'allowance', amountCents: paidAllowance.toString() },
    { code: 'calendarLeavePay', amountCents: calendarLeavePay.toString() },
    { code: 'annualLeavePay', amountCents: annualLeavePay.toString() },
    { code: 'leaveDeduction', amountCents: leaveDeduction.toString() },
    {
      code: 'absenceDeduction',
      amountCents: absenceDeduction.toString(),
      seconds: absenceSeconds,
    },
  );
  const resolved = taiwanDeductions(
    rules,
    terms,
    regular +
      paidAllowance +
      annualLeavePay +
      calendarLeavePay -
      leaveDeduction -
      absenceDeduction,
    {
      coverageDays: fraction.coverageDays,
      healthCharged: fraction.healthCharged,
      contributionDays: fraction.contributionDays,
      nonResident: fraction.nonResident,
    },
  );
  for (const code of [
    'laborInsurance',
    'healthInsurance',
    'voluntaryPension',
    'withholding',
    'otherDeduction',
  ] as const)
    lines.push({ code, amountCents: resolved[`${code}Cents`] });
  const sumLines = (codes: readonly PayrollLineCode[]) =>
    lines
      .filter((line) => codes.includes(line.code))
      .reduce((sum, line) => sum + BigInt(line.amountCents), 0n);
  const deduction = sumLines(PAYROLL_DEDUCTION_LINE_CODES);
  const exactNet = addRatios(
    exactRegular,
    exactAllowance,
    exactOvertime,
    exactHolidayPay,
    negateRatio(exactLeaveDeduction),
    negateRatio(exactAbsenceDeduction),
    ratio(
      calendarLeavePay +
        annualLeavePay -
        (deduction - leaveDeduction - absenceDeduction),
    ),
  );
  if (exactNet.numerator < 0n) blockers.push('negativeNetPay');
  lines.push({
    code: 'roundingAdjustment',
    amountCents: (
      ceilDollars(exactNet) -
      (sumLines(PAYROLL_EARNING_LINE_CODES) - deduction)
    ).toString(),
  });
  const gross = sumLines(PAYROLL_EARNING_LINE_CODES);
  return {
    lines,
    grossCents: gross.toString(),
    deductionCents: deduction.toString(),
    netCents: (gross - deduction).toString(),
    employerPensionCents: resolved.employerPensionCents,
    employerCosts:
      terms.insurance && fraction.occupationalAccidentRateMicros != null
        ? employerCosts(rules, terms.insurance, {
            contributionDays:
              fraction.contributionDays ?? fraction.coverageDays ?? 30,
            healthCharged:
              fraction.employerHealthCharged ?? fraction.healthCharged ?? true,
            occupationalAccidentRateMicros:
              fraction.occupationalAccidentRateMicros,
          })
        : undefined,
    workedSeconds: days.reduce((sum, day) => sum + day.seconds, 0),
    blockers: [...new Set(blockers)],
  };
}

export function payrollPeriod(month: string) {
  const [year, number] = month.split('-').map(Number);
  return {
    start: platformMonthStart(year, number - 1),
    end: platformMonthStart(year, number),
  };
}
