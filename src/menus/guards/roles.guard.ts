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

import { isAuthorized } from 'src/auth/permissions';
import {
  menu,
  menuItem,
  menuItemAddOn,
  menuSection,
  modifier,
  modifierGroup,
  offer,
} from 'src/db/schema/menus';
import { member, organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import {
  ROLES_KEY,
  type OrganizationParam,
} from '../decorators/roles.decorator';

export type AuthRequest = Request & {
  params: Record<string, string>;
  organizationId?: string;
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
    if (!requiredRoles || context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const { headers, params } = request;
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

    request.organizationId = organizationId;

    const membership = await this.db.query.member.findFirst({
      where: and(
        eq(member.organizationId, organizationId),
        eq(member.userId, userId),
      ),
      columns: { role: true },
    });
    if (!membership) throw new ForbiddenException();

    if (!isAuthorized(membership.role, requiredRoles.action))
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

      case 'organizationSlug': {
        const row = await this.db.query.organization.findFirst({
          where: eq(organization.slug, params.organizationSlug),
          columns: { id: true },
        });

        return row?.id;
      }

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
          with: {
            menuSection: {
              with: { menu: { columns: { organizationId: true } } },
            },
          },
        });

        return row?.menuSection?.menu?.organizationId;
      }

      case 'offerId': {
        const row = await this.db.query.offer.findFirst({
          where: eq(offer.id, params.offerId),
          with: {
            menuItem: { with: { menu: { columns: { organizationId: true } } } },
            menuSection: {
              with: { menu: { columns: { organizationId: true } } },
            },
          },
        });

        return (
          row?.menuItem?.menu?.organizationId ??
          row?.menuSection?.menu?.organizationId
        );
      }

      case 'addOnId': {
        const row = await this.db.query.menuItemAddOn.findFirst({
          where: eq(menuItemAddOn.id, params.addOnId),
          with: {
            menuItem: { with: { menu: { columns: { organizationId: true } } } },
          },
        });

        return row?.menuItem?.menu?.organizationId;
      }

      case 'groupId': {
        const row = await this.db.query.modifierGroup.findFirst({
          where: eq(modifierGroup.id, params.groupId),
          with: { menu: { columns: { organizationId: true } } },
        });

        return row?.menu?.organizationId;
      }

      case 'modifierId': {
        const row = await this.db.query.modifier.findFirst({
          where: eq(modifier.id, params.modifierId),
          with: {
            modifierGroup: {
              with: { menu: { columns: { organizationId: true } } },
            },
          },
        });

        return row?.modifierGroup?.menu?.organizationId;
      }
    }
  }
}
