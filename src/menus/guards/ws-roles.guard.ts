import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { and, eq } from 'drizzle-orm';
import { Socket } from 'socket.io';

import type { Auth } from '../../auth/index.js';
import { isAuthorized } from '../../auth/permissions.js';
import { member } from '../../db/schema/organizations.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import { DRIZZLE } from '../../drizzle/drizzle.module.js';

import {
  ROLES_KEY,
  type OrganizationParam,
} from '../decorators/roles.decorator.js';

@Injectable()
export class WsRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService<Auth>,
    @Inject(DRIZZLE) private db: DrizzleDB,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<{
      action?: Record<string, string[]>;
      organizationParam: OrganizationParam;
    }>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles) return true;
    if (requiredRoles.organizationParam !== 'organizationId')
      throw new Error(
        `WsRolesGuard only supports the 'organizationId' organizationParam, got '${requiredRoles.organizationParam}'`,
      );

    const data = context.switchToWs().getData<Record<string, unknown>>();
    const organizationId = data?.[requiredRoles.organizationParam];
    if (typeof organizationId !== 'string') throw new WsException('Forbidden');

    const client = context.switchToWs().getClient<Socket>();
    const session = await this.authService.api.getSession({
      headers: fromNodeHeaders(client.handshake.headers),
    });
    const userId = session?.user.id;
    if (!userId) throw new WsException('Forbidden');

    const membership = await this.db.query.member.findFirst({
      where: and(
        eq(member.organizationId, organizationId),
        eq(member.userId, userId),
      ),
      columns: { role: true },
    });
    const role =
      membership?.role ??
      (session.user.role === 'admin' ? ('owner' as const) : undefined);
    if (
      !role ||
      (requiredRoles.action && !isAuthorized(role, requiredRoles.action))
    )
      throw new WsException('Forbidden');

    return true;
  }
}
