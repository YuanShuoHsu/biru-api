import type { UserSession } from '@thallesp/nestjs-better-auth';

import type { AuthRequest } from 'src/menus/guards/roles.guard';

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
