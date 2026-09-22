import { and, eq, getTableColumns } from 'drizzle-orm';

import { attendanceEmployee } from 'src/db/schema/attendance';
import { user } from 'src/db/schema/users';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { AttendanceActor } from './attendance-actor';
import type { Transaction } from './attendance-audit';
import { forbiddenError } from './attendance-errors';
import { employeeStatus } from './employee-status';

export async function findEmployee(
  actor: AttendanceActor,
  db: DrizzleDB | Transaction,
) {
  const [employee] = await db
    .select({ ...getTableColumns(attendanceEmployee), name: user.name })
    .from(attendanceEmployee)
    .innerJoin(user, eq(user.id, attendanceEmployee.userId))
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
  if (employeeStatus(employee) !== 'active')
    throw forbiddenError('employeeNotEnabled');
  return employee;
}
