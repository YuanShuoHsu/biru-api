import type { UserSession } from '@thallesp/nestjs-better-auth';

import type { AuthRequest } from '../menus/guards/roles.guard.js';

export interface AttendanceActor {
  organizationId: string;
  userId: string;
  role: string;
}

export const actor = (
  req: AuthRequest,
  session: UserSession,
): AttendanceActor => ({
  organizationId: req.organizationId!,
  userId: session.user.id,
  role: req.memberRole!,
});
