import { and, eq, getTableColumns } from 'drizzle-orm';

import { attendanceEmployee } from '../db/schema/attendance.js';
import { user } from '../db/schema/users.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import type { AttendanceActor } from './attendance-actor.js';
import type { Transaction } from './attendance-audit.js';
import { forbiddenError } from './attendance-errors.js';
import { employeeStatus } from './employee-status.js';

export async function findEmployee(
  actor: AttendanceActor,
  db: DrizzleDB | Transaction,
) {
  const [employee] = await db
    .select({
      ...getTableColumns(attendanceEmployee),
      name: user.name,
      email: user.email,
    })
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
