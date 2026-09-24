import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { platformDateString } from 'src/common/constants/timezone';
import { attendanceAudit } from 'src/db/schema/attendance';
import { payrollStatement } from 'src/db/schema/payroll';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { AttendanceActor } from './attendance-actor';
import { conflictError } from './attendance-errors';

export type Transaction = Parameters<
  Parameters<DrizzleDB['transaction']>[0]
>[0];

export const lockOrganization = async (
  tx: Transaction,
  organizationId: string,
) => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`,
  );
};

export const lockEmployee = async (
  tx: Transaction,
  organizationId: string,
  employeeId: string,
) => {
  await tx.execute(
    sql`select pg_advisory_xact_lock_shared(hashtextextended(${organizationId}, 0))`,
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${employeeId}, 1))`,
  );
};

export const writeAudits = async (
  tx: Transaction,
  actor: AttendanceActor,
  action: string,
  entries: { resourceId: string; changes: Record<string, unknown> }[],
) => {
  if (!entries.length) return;
  await tx.insert(attendanceAudit).values(
    entries.map(({ resourceId, changes }) => ({
      id: randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action,
      resourceId,
      changes,
    })),
  );
};

export const writeAudit = (
  tx: Transaction,
  actor: AttendanceActor,
  action: string,
  resourceId: string,
  changes: Record<string, unknown>,
) => writeAudits(tx, actor, action, [{ resourceId, changes }]);

export const assertPayrollUnlocked = async (
  tx: Transaction,
  organizationId: string,
  employeeId: string,
  startsAt: Date,
  endsAt?: Date,
) => {
  const [published] = await tx
    .select({ id: payrollStatement.id })
    .from(payrollStatement)
    .where(
      and(
        eq(payrollStatement.organizationId, organizationId),
        eq(payrollStatement.employeeId, employeeId),
        eq(payrollStatement.status, 'published'),
        gte(payrollStatement.month, platformDateString(startsAt).slice(0, 7)),
        endsAt
          ? lte(
              payrollStatement.month,
              platformDateString(new Date(endsAt.getTime() - 1)).slice(0, 7),
            )
          : undefined,
      ),
    )
    .limit(1);
  if (published) throw conflictError('payrollLocked');
};
