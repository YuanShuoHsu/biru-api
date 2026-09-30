import { eq } from 'drizzle-orm';

import { isAuthorized } from 'src/auth/permissions';
import { member } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { AttendanceActor } from './attendance-actor';
import type { Transaction } from './attendance-audit';
import { type AttendanceErrorCode, forbiddenError } from './attendance-errors';

export type ReviewPermission =
  | 'attendanceRequest'
  | 'leaveCase'
  | 'parentalChild'
  | 'parentalReturn'
  | 'payslip';

const REVIEW_PERMISSIONS: Record<ReviewPermission, Record<string, string[]>> = {
  attendanceRequest: { attendanceRequest: ['update'] },
  leaveCase: { leaveCase: ['create', 'update', 'delete'] },
  parentalChild: { parentalChild: ['create'] },
  parentalReturn: { parentalReturn: ['update'] },
  payslip: { payslip: ['update'] },
};

const holdsPermission = (roles: string, permission: ReviewPermission) =>
  roles
    .split(',')
    .some((role) => isAuthorized(role.trim(), REVIEW_PERMISSIONS[permission]));

export const alternateReviewerExists = async (
  db: DrizzleDB | Transaction,
  organizationId: string,
  permission: ReviewPermission,
  excludedUserIds: string[],
) =>
  (
    await db
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(eq(member.organizationId, organizationId))
  ).some(
    ({ role, userId }) =>
      !excludedUserIds.includes(userId) && holdsPermission(role, permission),
  );

// 雙人覆核只在店裡確實有第二位有權限者時才強制；獨資店家沒有人能審，強制只會讓案件永遠卡住
export const assertIndependentReview = async (
  db: DrizzleDB | Transaction,
  actor: AttendanceActor,
  permission: ReviewPermission,
  involvedUserIds: string[],
  code: AttendanceErrorCode = 'cannotReviewSelf',
) => {
  if (!involvedUserIds.includes(actor.userId)) return;
  if (
    await alternateReviewerExists(db, actor.organizationId, permission, [
      ...new Set([actor.userId, ...involvedUserIds]),
    ])
  )
    throw forbiddenError(code);
};

export const selfReviewAllowance = async (
  db: DrizzleDB | Transaction,
  actor: AttendanceActor,
) => {
  const entries = await Promise.all(
    (Object.keys(REVIEW_PERMISSIONS) as ReviewPermission[]).map(
      async (permission) =>
        [
          permission,
          !(await alternateReviewerExists(
            db,
            actor.organizationId,
            permission,
            [actor.userId],
          )),
        ] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<ReviewPermission, boolean>;
};
