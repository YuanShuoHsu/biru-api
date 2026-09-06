import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { isAuthorized } from 'src/auth/permissions';

import type { AuthRequest } from '../guards/roles.guard';

// memberRole 由 RolesGuard 掛上，所以只有標了 @Roles 的路由能用這個裝飾器
export const HasPermission = createParamDecorator(
  (action: Record<string, string[]>, context: ExecutionContext): boolean => {
    const { memberRole } = context.switchToHttp().getRequest<AuthRequest>();

    return !!memberRole && isAuthorized(memberRole, action);
  },
);
