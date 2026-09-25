import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import type { Transaction } from 'src/attendance/attendance-audit';
import {
  countedRequestStatuses,
  NOTICE_TERMINATION_REASONS,
  SEVERANCE_TERMINATION_REASONS,
} from 'src/attendance/attendance-rules';
import { anniversary, isCalendarLeave } from 'src/attendance/leave-rules';
import {
  DAY_MS,
  platformDateString,
  platformMidnight,
} from 'src/common/constants/timezone';
import {
  attendanceEvent,
  attendanceLeaveCase,
  attendanceLeaveType,
  attendanceRequest,
  type attendanceEmployee,
  type AttendanceTerminationReason,
  type StatutoryLeaveKind,
} from 'src/db/schema/attendance';
import {
  payrollStatement,
  type PayrollTerms,
  type WithholdingTable,
} from 'src/db/schema/payroll';

import { hourlyRate } from './payroll-calculation';

export const NEW_PENSION_SYSTEM_START = new Date('2005-07-01T00:00:00+08:00');

const AVERAGE_WAGE_MONTHS = 6;

const HOURLY_AVERAGE_FLOOR_PERCENT = 60n;

const RETIREMENT_WITHHOLDING_BP = 600n;

const NON_RESIDENT_RETIREMENT_WITHHOLDING_BP = 1800n;

const BP = 10000n;

// 施行細則 §2 第 2、3、5、6、7 款：這些假別的期間與工資不計入平均工資
const AVERAGE_WAGE_EXCLUDED_KINDS: readonly StatutoryLeaveKind[] = [
  'sick',
  'hospitalSick',
  'pregnancyRest',
  'menstrual',
  'familyCare',
  'parental',
  'occupationalInjury',
];

const REDUCED_PAY_EXCLUDED_KINDS: readonly StatutoryLeaveKind[] = [
  'maternity',
  'miscarriage28',
  'miscarriage7',
  'miscarriage5',
];

export function seniority(hiredAt: Date, terminatedAt: Date) {
  let months = 0;
  while (anniversary(hiredAt, months + 1) <= terminatedAt) months++;
  const days = Math.round(
    (platformMidnight(terminatedAt.getTime()) -
      platformMidnight(anniversary(hiredAt, months).getTime())) /
      DAY_MS,
  );
  return { years: Math.floor(months / 12), months: months % 12, days };
}

type Seniority = ReturnType<typeof seniority>;

export function noticeDays({ years, months }: Seniority) {
  const total = years * 12 + months;
  return total < 3 ? 0 : total < 12 ? 10 : total < 36 ? 20 : 30;
}

export function severanceMonths(
  { years, months, days }: Seniority,
  pensionScheme: boolean,
) {
  if (!pensionScheme)
    return {
      numerator: BigInt(years * 12 + months + (days > 0 ? 1 : 0)),
      denominator: 12n,
    };
  const numerator = BigInt(years * 4380 + months * 365 + days * 12);
  const cap = 6n * 8760n;
  return {
    numerator: numerator < cap ? numerator : cap,
    denominator: 8760n,
  };
}

export function retirementWithholding(
  table: WithholdingTable,
  amountCents: bigint,
  { years, months, days }: Seniority,
  nonResident: boolean,
  exemptTaxCents: bigint,
) {
  const halfYears =
    BigInt(years * 2) + (months || days ? (months < 6 ? 1n : 2n) : 0n);
  const exempt =
    (BigInt(table.retirementExemptPerYear) * 100n * halfYears) / 2n;
  const halfTaxable =
    (BigInt(table.retirementHalfTaxablePerYear) * 100n * halfYears) / 2n;
  const income =
    amountCents <= exempt
      ? 0n
      : amountCents <= halfTaxable
        ? (amountCents - exempt) / 2n
        : (halfTaxable - exempt) / 2n + (amountCents - halfTaxable);
  const tax =
    ((income *
      (nonResident
        ? NON_RESIDENT_RETIREMENT_WITHHOLDING_BP
        : RETIREMENT_WITHHOLDING_BP)) /
      BP /
      100n) *
    100n;
  return !nonResident && tax <= exemptTaxCents ? 0n : tax;
}

const dayRange = (from: number, to: number) => {
  const dates: string[] = [];
  for (let day = platformMidnight(from); day < to; day += DAY_MS)
    dates.push(platformDateString(new Date(day)));
  return dates;
};

const monthOf = (date: string) => date.slice(0, 7);

interface AverageWageInput {
  employee: typeof attendanceEmployee.$inferSelect;
  terminatedAt: Date;
  currentMonth: string;
  currentWageCents: bigint;
  termsAt: (date: Date) => PayrollTerms;
  hourly: boolean;
}

export async function averageDailyWage(
  tx: Transaction,
  input: AverageWageInput,
) {
  const { employee, terminatedAt, currentMonth, termsAt } = input;
  const windowEnd = platformMidnight(terminatedAt.getTime());
  const windowStart = Math.max(
    anniversary(new Date(windowEnd), -AVERAGE_WAGE_MONTHS).getTime(),
    platformMidnight(employee.hiredAt.getTime()),
  );
  const employedDates = dayRange(
    employee.hiredAt.getTime(),
    terminatedAt.getTime(),
  );
  const windowDates = new Set(dayRange(windowStart, windowEnd));
  const months = [
    ...new Set([...windowDates].map(monthOf).filter((m) => m < currentMonth)),
  ];
  const statements = months.length
    ? await tx
        .select({
          month: payrollStatement.month,
          snapshot: payrollStatement.snapshot,
        })
        .from(payrollStatement)
        .where(
          and(
            eq(payrollStatement.employeeId, employee.id),
            eq(payrollStatement.status, 'published'),
            inArray(payrollStatement.month, months),
          ),
        )
    : [];
  if (statements.length !== months.length) return null;
  const leaves = await tx
    .select({
      request: attendanceRequest,
      kind: attendanceLeaveType.statutoryKind,
      dailyPayCents: attendanceLeaveCase.dailyPayCents,
    })
    .from(attendanceRequest)
    .innerJoin(
      attendanceLeaveType,
      eq(attendanceLeaveType.id, attendanceRequest.leaveTypeId),
    )
    .leftJoin(
      attendanceLeaveCase,
      eq(attendanceLeaveCase.id, attendanceRequest.leaveCaseId),
    )
    .where(
      and(
        eq(attendanceRequest.employeeId, employee.id),
        eq(attendanceRequest.kind, 'leave'),
        inArray(attendanceRequest.status, countedRequestStatuses),
        lt(attendanceRequest.startsAt, new Date(windowEnd)),
        sql`${attendanceRequest.endsAt} > ${new Date(
          `${monthOf(platformDateString(new Date(windowStart)))}-01T00:00:00+08:00`,
        )}`,
      ),
    )
    .orderBy(asc(attendanceRequest.startsAt));
  const excludedDates = new Set<string>();
  const excludedPay = new Map<string, bigint>();
  const addPay = (month: string, cents: bigint) =>
    excludedPay.set(month, (excludedPay.get(month) ?? 0n) + cents);
  for (const { request, kind, dailyPayCents } of leaves) {
    const paidPercent = BigInt(request.paidPercent ?? 0);
    if (
      !AVERAGE_WAGE_EXCLUDED_KINDS.includes(kind) &&
      !(REDUCED_PAY_EXCLUDED_KINDS.includes(kind) && paidPercent < 100n)
    )
      continue;
    const dates = dayRange(
      request.startsAt.getTime(),
      request.endsAt.getTime(),
    );
    for (const date of dates) excludedDates.add(date);
    if (isCalendarLeave(kind))
      for (const date of dates)
        addPay(
          monthOf(date),
          (BigInt(dailyPayCents ?? '0') * paidPercent) / 100n,
        );
    else {
      const rate = hourlyRate(termsAt(request.startsAt), 0);
      addPay(
        monthOf(dates[0]),
        (rate.numerator * BigInt(request.leaveMinutes ?? 0) * paidPercent) /
          (rate.denominator * 60n * 100n),
      );
    }
  }
  const wageOf = (month: string) => {
    if (month === currentMonth) return input.currentWageCents;
    const snapshot = statements.find((row) => row.month === month)!.snapshot;
    const line = (code: string) =>
      BigInt(
        snapshot.lines.find((item) => item.code === code)?.amountCents ?? '0',
      );
    return (
      BigInt(snapshot.grossCents) -
      line('annualLeavePay') -
      line('severancePay') -
      line('noticePay')
    );
  };
  let totalCents = 0n;
  let totalDays = 0;
  for (const month of new Set([...windowDates].map(monthOf))) {
    const included = employedDates.filter(
      (date) => monthOf(date) === month && !excludedDates.has(date),
    );
    const inWindow = included.filter((date) => windowDates.has(date));
    if (!included.length || !inWindow.length) continue;
    const base = wageOf(month) - (excludedPay.get(month) ?? 0n);
    totalCents +=
      ((base > 0n ? base : 0n) * BigInt(inWindow.length)) /
      BigInt(included.length);
    totalDays += inWindow.length;
  }
  if (!totalDays) return null;
  let daily = totalCents / BigInt(totalDays);
  if (input.hourly) {
    const workedDates = new Set(
      (
        await tx
          .select({ occurredAt: attendanceEvent.occurredAt })
          .from(attendanceEvent)
          .where(
            and(
              eq(attendanceEvent.employeeId, employee.id),
              eq(attendanceEvent.action, 'clockIn'),
              gte(attendanceEvent.occurredAt, new Date(windowStart)),
              lt(attendanceEvent.occurredAt, new Date(windowEnd)),
            ),
          )
      )
        .map(({ occurredAt }) => platformDateString(occurredAt))
        .filter((date) => !excludedDates.has(date)),
    );
    if (workedDates.size) {
      const floor =
        (totalCents * HOURLY_AVERAGE_FLOOR_PERCENT) /
        (BigInt(workedDates.size) * 100n);
      if (floor > daily) daily = floor;
    }
  }
  return daily;
}

export const owesSeverance = (reason: AttendanceTerminationReason | null) =>
  !!reason && SEVERANCE_TERMINATION_REASONS.includes(reason);

export const owesNotice = (reason: AttendanceTerminationReason | null) =>
  !!reason && NOTICE_TERMINATION_REASONS.includes(reason);

export function terminationPay({
  dailyWageCents,
  employee,
  pensionScheme,
  terminatedAt,
  terms,
  weeklyMinutes,
  table,
  nonResident,
  exemptTaxCents,
}: {
  dailyWageCents: bigint;
  employee: typeof attendanceEmployee.$inferSelect;
  pensionScheme: boolean;
  terminatedAt: Date;
  terms: PayrollTerms;
  weeklyMinutes: number;
  table: WithholdingTable;
  nonResident: boolean;
  exemptTaxCents: bigint;
}) {
  const length = seniority(employee.hiredAt, terminatedAt);
  const months = severanceMonths(length, pensionScheme);
  const severancePay = owesSeverance(employee.terminationReason)
    ? (dailyWageCents * 30n * months.numerator) / months.denominator
    : 0n;
  const noticedDays = employee.terminationNoticedAt
    ? Math.floor(
        (platformMidnight(terminatedAt.getTime()) -
          platformMidnight(employee.terminationNoticedAt.getTime())) /
          DAY_MS,
      )
    : 0;
  const shortfall = owesNotice(employee.terminationReason)
    ? Math.max(0, noticeDays(length) - noticedDays)
    : 0;
  const agreedDaily =
    terms.salaryType === 'monthly'
      ? (BigInt(terms.salaryCents) + BigInt(terms.allowanceCents)) / 30n
      : (BigInt(terms.salaryCents) * BigInt(Math.min(weeklyMinutes, 2400))) /
        (5n * 60n);
  const noticePay =
    BigInt(shortfall) *
    (agreedDaily > dailyWageCents ? agreedDaily : dailyWageCents);
  const whole = (cents: bigint) => (cents / 100n) * 100n;
  return {
    severancePayCents: whole(severancePay).toString(),
    noticePayCents: whole(noticePay).toString(),
    retirementWithholdingCents: retirementWithholding(
      table,
      whole(severancePay) + whole(noticePay),
      length,
      nonResident,
      exemptTaxCents,
    ).toString(),
  };
}
