import { and, eq } from 'drizzle-orm';

import { attendanceEmployee } from 'src/db/schema/attendance';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { AttendanceActor } from './attendance-actor';
import type { Transaction } from './attendance-audit';
import { forbiddenError } from './attendance-errors';

export async function findEmployee(
  actor: AttendanceActor,
  db: DrizzleDB | Transaction,
) {
  const [employee] = await db
    .select()
    .from(attendanceEmployee)
    .where(
      and(
        eq(attendanceEmployee.organizationId, actor.organizationId),
        eq(attendanceEmployee.userId, actor.userId),
      ),
    );
  return employee;
}

export async function requireEmployee(
  actor: AttendanceActor,
  db: DrizzleDB | Transaction,
) {
  const employee = await findEmployee(actor, db);
  if (!employee) throw forbiddenError('employeeNotEnabled');
  return employee;
}

export async function requireActiveEmployee(
  actor: AttendanceActor,
  db: DrizzleDB | Transaction,
) {
  const employee = await requireEmployee(actor, db);
  const now = new Date();
  if (
    !employee.enabled ||
    employee.hiredAt > now ||
    (employee.terminatedAt && employee.terminatedAt <= now)
  )
    throw forbiddenError('employeeNotEnabled');
  return employee;
}
