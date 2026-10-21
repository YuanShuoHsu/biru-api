import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthRequest } from '../guards/roles.guard.js';

export const OrganizationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<AuthRequest>().organizationId!,
);
