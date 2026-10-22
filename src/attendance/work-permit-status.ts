import { sql } from 'drizzle-orm';

import { PLATFORM_TIMEZONE } from '../common/constants/timezone.js';
import {
  attendanceEmployee,
  type AttendanceWorkPermitStatus,
} from '../db/schema/attendance.js';

import { WORK_PERMIT_RENEWAL_NOTICE_DAYS } from './attendance-rules.js';

const noticeDays = Object.entries(WORK_PERMIT_RENEWAL_NOTICE_DAYS);

const workPermitApplicableSql = sql`(${attendanceEmployee.legalStatus} IN (${sql.join(
  noticeDays.map(([legalStatus]) => sql`${legalStatus}`),
  sql`, `,
)}) AND (${attendanceEmployee.terminatedAt} IS NULL OR ${attendanceEmployee.terminatedAt} > now()))`;

const platformTodaySql = sql`(now() AT TIME ZONE ${PLATFORM_TIMEZONE})::date`;

const coverageStartSql = sql`greatest(${platformTodaySql}, (${attendanceEmployee.hiredAt} AT TIME ZONE ${PLATFORM_TIMEZONE})::date)`;

// 相鄰（迄日隔天即起日）的許可期間視為連續，從今天或到職日起算到連續涵蓋的最後一天
export const workPermitDaysLeftSql = sql<
  number | null
>`CASE WHEN ${workPermitApplicableSql} THEN (
  SELECT max(span.through) - ${platformTodaySql}
  FROM (
    SELECT min(grouped.since) AS since, max(grouped.through) AS through
    FROM (
      SELECT since, through,
        count(*) FILTER (WHERE since > reach + 1) OVER (ORDER BY since, through) AS island
      FROM (
        SELECT (period->>'from')::date AS since, (period->>'to')::date AS through,
          max((period->>'to')::date) OVER (
            ORDER BY (period->>'from')::date, (period->>'to')::date
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ) AS reach
        FROM jsonb_array_elements(${attendanceEmployee.workPermits}) AS period
      ) periods
    ) grouped
    GROUP BY grouped.island
  ) span
  WHERE span.since <= ${coverageStartSql} AND span.through >= ${coverageStartSql}
) END`;

export const workPermitStatusSql = sql<AttendanceWorkPermitStatus | null>`CASE
  WHEN ${workPermitApplicableSql} IS NOT TRUE THEN NULL
  WHEN ${workPermitDaysLeftSql} IS NULL THEN 'invalid'
  WHEN ${workPermitDaysLeftSql} <= CASE ${attendanceEmployee.legalStatus} ${sql.join(
    noticeDays.map(
      ([legalStatus, days]) =>
        sql`WHEN ${legalStatus} THEN ${sql.raw(String(days))}`,
    ),
    sql` `,
  )} END THEN 'expiring'
  ELSE 'valid' END`;

export const workPermitOrderSql = sql`CASE
  WHEN ${workPermitApplicableSql} THEN coalesce(${workPermitDaysLeftSql}, ${sql.raw('-1')})
  END`;
