import { sql } from 'drizzle-orm';

import {
  attendanceEmployee,
  type AttendanceEmployeeStatus,
} from 'src/db/schema/attendance';

interface EmploymentWindow {
  enabled: boolean;
  hiredAt: Date;
  terminatedAt: Date | null;
}

export const employeeStatus = (
  employee: EmploymentWindow | null | undefined,
  at = new Date(),
): AttendanceEmployeeStatus => {
  if (!employee) return 'unconfigured';
  if (employee.terminatedAt && employee.terminatedAt <= at) return 'terminated';
  if (!employee.enabled) return 'disabled';
  if (employee.hiredAt > at) return 'upcoming';

  return 'active';
};

export const employeeStatusSql = sql<AttendanceEmployeeStatus>`CASE
  WHEN ${attendanceEmployee.id} IS NULL THEN 'unconfigured'
  WHEN ${attendanceEmployee.terminatedAt} <= now() THEN 'terminated'
  WHEN NOT ${attendanceEmployee.enabled} THEN 'disabled'
  WHEN ${attendanceEmployee.hiredAt} > now() THEN 'upcoming'
  ELSE 'active' END`;

export const employeeStatusOrderSql = sql`CASE
  WHEN ${attendanceEmployee.id} IS NULL THEN ${sql.raw('0')}
  WHEN ${attendanceEmployee.terminatedAt} <= now() THEN ${sql.raw('4')}
  WHEN NOT ${attendanceEmployee.enabled} THEN ${sql.raw('3')}
  WHEN ${attendanceEmployee.hiredAt} > now() THEN ${sql.raw('1')}
  ELSE ${sql.raw('2')} END`;
