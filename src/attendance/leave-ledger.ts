import { and, asc, eq, inArray, lt, ne, sql } from 'drizzle-orm';

import {
  platformDateString,
  platformMonthStart,
  toPlatformTime,
} from 'src/common/constants/timezone';
import {
  attendanceAnnualLeaveDeferral,
  attendanceEmployee,
  attendanceLeaveBalance,
  attendanceLeaveCase,
  attendanceLeaveType,
  attendanceRequest,
  attendanceShift,
} from 'src/db/schema/attendance';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { Transaction } from './attendance-audit';
import { badRequestError } from './attendance-errors';
import {
  countedRequestStatuses,
  scheduledWorkSeconds,
} from './attendance-rules';
import {
  loadOneEmployeeHours,
  weeklyMinutesAt,
  weeklyMinutesOf,
  type EmployeeHours,
} from './employee-hours';
import {
  anniversary,
  annualLeaveLedger,
  statutoryLeavePeriod,
} from './leave-rules';
import { isMedicalLeave, loadMedicalLedger } from './medical-leave';

export async function leaveBalanceRow(
  tx: Transaction,
  employeeId: string,
  leaveTypeId: string,
  at: Date,
) {
  const [balance] = await tx
    .select()
    .from(attendanceLeaveBalance)
    .where(
      and(
        eq(attendanceLeaveBalance.employeeId, employeeId),
        eq(attendanceLeaveBalance.leaveTypeId, leaveTypeId),
        eq(attendanceLeaveBalance.year, leaveYear(at)),
      ),
    );
  return balance;
}

export function leaveYear(date: Date) {
  return toPlatformTime(date).getUTCFullYear();
}

export async function leaveMinutes(
  tx: Transaction,
  employeeId: string,
  startsAt: Date,
  endsAt: Date,
) {
  const shifts = await tx
    .select()
    .from(attendanceShift)
    .where(
      and(
        eq(attendanceShift.employeeId, employeeId),
        ne(attendanceShift.status, 'cancelled'),
        lt(attendanceShift.startsAt, endsAt),
        sql`${attendanceShift.endsAt} > ${startsAt}`,
      ),
    );
  return Math.ceil(
    shifts.reduce(
      (total, shift) =>
        total +
        scheduledWorkSeconds(shift, startsAt.getTime(), endsAt.getTime()),
      0,
    ) / 60,
  );
}

export async function matchLeaveCase(
  tx: Transaction,
  organizationId: string,
  employeeId: string,
  leaveTypeId: string,
  id: string | null | undefined,
  startsAt: Date,
  endsAt: Date,
) {
  if (!id) throw badRequestError('leaveCaseRequired');
  const [row] = await tx
    .select()
    .from(attendanceLeaveCase)
    .where(
      and(
        eq(attendanceLeaveCase.id, id),
        eq(attendanceLeaveCase.organizationId, organizationId),
        eq(attendanceLeaveCase.employeeId, employeeId),
        eq(attendanceLeaveCase.leaveTypeId, leaveTypeId),
      ),
    );
  if (!row || startsAt < row.startsAt || endsAt > row.endsAt)
    throw badRequestError('invalidLeaveCase');
  return row;
}

export async function leaveCaseUsage(tx: Transaction | DrizzleDB, id: string) {
  const [row] = await tx
    .select({
      minutes: sql<number>`coalesce(sum(${attendanceRequest.leaveMinutes}), 0)::integer`,
    })
    .from(attendanceRequest)
    .where(
      and(
        eq(attendanceRequest.leaveCaseId, id),
        inArray(attendanceRequest.status, countedRequestStatuses),
      ),
    );
  return row.minutes;
}

export function annualLeaveDeferrals(
  tx: Transaction | DrizzleDB,
  employeeIds: string[],
) {
  return tx
    .select()
    .from(attendanceAnnualLeaveDeferral)
    .where(inArray(attendanceAnnualLeaveDeferral.employeeId, employeeIds))
    .orderBy(asc(attendanceAnnualLeaveDeferral.periodStart));
}

export function countedLeaves(
  tx: Transaction | DrizzleDB,
  employeeId: string,
  from: Date,
  to: Date,
) {
  return tx
    .select()
    .from(attendanceRequest)
    .where(
      and(
        eq(attendanceRequest.employeeId, employeeId),
        eq(attendanceRequest.kind, 'leave'),
        inArray(attendanceRequest.status, countedRequestStatuses),
        sql`${attendanceRequest.startsAt} >= ${from}`,
        lt(attendanceRequest.startsAt, to),
      ),
    )
    .orderBy(asc(attendanceRequest.startsAt));
}

export async function statutoryBalance(
  tx: Transaction | DrizzleDB,
  employee: typeof attendanceEmployee.$inferSelect,
  policy: typeof attendanceLeaveType.$inferSelect,
  at: Date,
  preloaded?: {
    policies?: (typeof attendanceLeaveType.$inferSelect)[];
    ledger?: Awaited<ReturnType<typeof loadMedicalLedger>>;
    records?: (typeof attendanceRequest.$inferSelect)[];
    hours?: EmployeeHours;
    deferrals?: (typeof attendanceAnnualLeaveDeferral.$inferSelect)[];
  },
) {
  const hours = preloaded?.hours ?? (await loadOneEmployeeHours(tx, employee));
  if (
    isMedicalLeave(policy.statutoryKind) &&
    policy.statutoryKind !== 'menstrual'
  ) {
    const ledger = preloaded?.ledger ?? (await loadMedicalLedger(tx, employee));
    const year = Number(platformDateString(at).slice(0, 4));
    const hospital = policy.statutoryKind !== 'sick';
    const yearStart = platformMonthStart(hospital ? year - 1 : year, 0);
    const yearMinutes = weeklyMinutesAt(hours, yearStart);
    const days = hospital
      ? (ledger.years.get(year)?.shared ?? 0) +
        (ledger.years.get(year - 1)?.shared ?? 0)
      : (ledger.years.get(year)?.ordinary ?? 0);
    return {
      id: `statutory:${employee.id}:${policy.id}:${year}`,
      organizationId: employee.organizationId,
      employeeId: employee.id,
      leaveTypeId: policy.id,
      year,
      grantedMinutes: Math.ceil(((hospital ? 365 : 30) * yearMinutes) / 5),
      usedMinutes: Math.ceil((days * yearMinutes) / 5),
      startsAt: yearStart,
      endsAt: platformMonthStart(year + 1, 0),
      statutory: true,
      annualLeaveDeferralId: null,
    };
  }
  const period = statutoryLeavePeriod(
    policy.statutoryKind,
    employee.hiredAt,
    at,
    weeklyMinutesOf(hours),
  );
  if (!period) return null;
  const policies =
    preloaded?.policies ??
    (await tx
      .select()
      .from(attendanceLeaveType)
      .where(eq(attendanceLeaveType.organizationId, employee.organizationId)));
  if (policy.statutoryKind === 'annual') {
    const annualIds = new Set(
      policies
        .filter((item) => item.statutoryKind === 'annual')
        .map((item) => item.id),
    );
    // 遞延要從到職逐期結轉，只抓當期紀錄會算不出上期結轉進來的時數
    const from = anniversary(employee.hiredAt, 6);
    const records = (
      preloaded?.records ??
      (await countedLeaves(tx, employee.id, from, period.end))
    ).filter(
      (record) => record.leaveTypeId && annualIds.has(record.leaveTypeId),
    );
    const deferrals =
      preloaded?.deferrals ?? (await annualLeaveDeferrals(tx, [employee.id]));
    const ledger = annualLeaveLedger(
      employee.hiredAt,
      at,
      weeklyMinutesOf(hours),
      records,
      deferrals
        .filter((deferral) => deferral.employeeId === employee.id)
        .map((deferral) => deferral.periodStart),
    );
    const current = ledger[ledger.length - 1];
    if (!current) return null;
    const deferral = deferrals.find(
      (item) =>
        item.employeeId === employee.id &&
        item.periodStart.getTime() === current.start.getTime(),
    );

    return {
      id: `statutory:${employee.id}:${policy.id}:${current.start.toISOString()}`,
      organizationId: employee.organizationId,
      employeeId: employee.id,
      leaveTypeId: policy.id,
      year: leaveYear(current.start),
      grantedMinutes: current.minutes + current.carriedInMinutes,
      usedMinutes: current.usedMinutes,
      startsAt: current.start,
      endsAt: current.end,
      statutory: true,
      annualLeaveDeferralId: deferral?.id ?? null,
    };
  }
  const records = (
    preloaded?.records ??
    (await countedLeaves(tx, employee.id, period.start, period.end))
  ).filter(
    (record) => record.startsAt >= period.start && record.startsAt < period.end,
  );
  let usedMinutes = 0;
  for (const record of records) {
    const kind = policies.find(
      (item) => item.id === record.leaveTypeId,
    )?.statutoryKind;
    if (
      kind === policy.statutoryKind ||
      (policy.statutoryKind === 'personal' && kind === 'familyCare')
    )
      usedMinutes += record.leaveMinutes ?? 0;
  }
  return {
    id: `statutory:${employee.id}:${policy.id}:${period.start.toISOString()}`,
    organizationId: employee.organizationId,
    employeeId: employee.id,
    leaveTypeId: policy.id,
    year: leaveYear(period.start),
    grantedMinutes: period.minutes,
    usedMinutes,
    startsAt: period.start,
    endsAt: period.end,
    statutory: true,
    annualLeaveDeferralId: null,
  };
}
