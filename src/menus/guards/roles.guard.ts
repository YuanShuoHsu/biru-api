import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { and, eq } from 'drizzle-orm';
import { Request } from 'express';

import {
  admin as adminRole,
  member as memberRole,
  owner as ownerRole,
} from 'src/auth/permissions';
import { menu, menuItem, menuSection } from 'src/db/schema/menus';
import { member } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import {
  ROLES_KEY,
  type OrganizationParam,
} from '../decorators/roles.decorator';

type AuthRequest = Request & {
  params: Record<string, string>;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
    @Inject(DRIZZLE) private db: DrizzleDB,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<{
      action: Record<string, string[]>;
      organizationParam: OrganizationParam;
    }>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles) return true;

    const { headers, params } = context
      .switchToHttp()
      .getRequest<AuthRequest>();
    const session = await this.authService.api.getSession({
      headers: fromNodeHeaders(headers),
    });
    const userId = session?.user.id;
    if (!userId) throw new ForbiddenException();

    const organizationId = await this.resolveOrganizationId(
      requiredRoles.organizationParam,
      params,
    );
    if (!organizationId) throw new ForbiddenException();

    const membership = await this.db.query.member.findFirst({
      where: and(
        eq(member.organizationId, organizationId),
        eq(member.userId, userId),
      ),
      columns: { role: true },
    });
    if (!membership) throw new ForbiddenException();

    if (!this.isAuthorized(membership.role, requiredRoles.action))
      throw new ForbiddenException();

    return true;
  }

  private async resolveOrganizationId(
    organizationParam: OrganizationParam,
    params: Record<string, string>,
  ): Promise<string | undefined> {
    switch (organizationParam) {
      case 'organizationId':
        return params.organizationId;

      case 'menuId': {
        const row = await this.db.query.menu.findFirst({
          where: eq(menu.id, params.menuId),
          columns: { organizationId: true },
        });

        return row?.organizationId;
      }

      case 'sectionId': {
        const row = await this.db.query.menuSection.findFirst({
          where: eq(menuSection.id, params.sectionId),
          with: { menu: { columns: { organizationId: true } } },
        });

        return row?.menu?.organizationId;
      }

      case 'menuItemId': {
        const row = await this.db.query.menuItem.findFirst({
          where: eq(menuItem.id, params.menuItemId),
          with: { menu: { columns: { organizationId: true } } },
        });

        return row?.menu?.organizationId;
      }
    }
  }

  private isAuthorized(
    role: string,
    action: Record<string, string[]>,
  ): boolean {
    switch (role) {
      case 'owner':
        return ownerRole.authorize(action).success;
      case 'admin':
        return adminRole.authorize(action).success;
      case 'member':
        return memberRole.authorize(action).success;
      default:
        return false;
    }
  }
}
