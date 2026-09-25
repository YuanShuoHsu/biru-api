import { and, eq } from 'drizzle-orm';

import {
  attendanceParentalChild,
  attendanceParentalReturn,
} from 'src/db/schema/attendance';

import type { Transaction } from './attendance-audit';
import { badRequestError, conflictError } from './attendance-errors';

export async function matchParentalChild(
  tx: Transaction,
  organizationId: string,
  employeeId: string,
  childId: string | undefined,
  eventDate?: Date,
) {
  if (!childId) throw badRequestError('parentalChildRequired');
  const [child] = await tx
    .select()
    .from(attendanceParentalChild)
    .where(
      and(
        eq(attendanceParentalChild.id, childId),
        eq(attendanceParentalChild.organizationId, organizationId),
        eq(attendanceParentalChild.employeeId, employeeId),
      ),
    );
  if (
    !child ||
    (eventDate && child.birthDate.getTime() !== eventDate.getTime())
  )
    throw badRequestError('parentalChildMismatch');
  return child;
}

export async function assertNoParentalReturn(
  tx: Transaction,
  requestId: string,
) {
  const [pending] = await tx
    .select({ id: attendanceParentalReturn.id })
    .from(attendanceParentalReturn)
    .where(
      and(
        eq(attendanceParentalReturn.requestId, requestId),
        eq(attendanceParentalReturn.status, 'pending'),
      ),
    );
  if (pending) throw conflictError('parentalReturnPending');
}
