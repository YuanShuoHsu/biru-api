import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthService } from '@thallesp/nestjs-better-auth';

import type { Auth } from '../../auth/index.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

import { type AuthRequest, RolesGuard } from './roles.guard.js';

const guardFor = ({
  userRole,
  memberRole,
  closed = false,
}: {
  userRole: string;
  memberRole?: 'owner' | 'admin' | 'member';
  closed?: boolean;
}) => {
  const authService = {
    api: {
      getSession: vi
        .fn()
        .mockResolvedValue({ user: { id: 'user', role: userRole } }),
    },
  };
  const db = {
    query: {
      member: {
        findFirst: vi
          .fn()
          .mockResolvedValue(memberRole ? { role: memberRole } : undefined),
      },
      organization: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ closedAt: closed ? new Date() : null }),
      },
    },
  };

  return new RolesGuard(
    new Reflector(),
    authService as unknown as AuthService<Auth>,
    db as unknown as DrizzleDB,
  );
};

const contextFor = (
  action: Record<string, string[]> | undefined,
  method = 'GET',
) => {
  const request = {
    headers: {},
    method,
    params: { organizationId: 'org' },
  } as unknown as AuthRequest;
  const handler = () => undefined;
  Reflect.defineMetadata(
    'roles',
    { action, organizationParam: 'organizationId' },
    handler,
  );

  const context = {
    getClass: () => class {},
    getHandler: () => handler,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
};

describe('RolesGuard', () => {
  it('lets a platform admin who is not a member act as the owner', async () => {
    const { context, request } = contextFor({ organization: ['update'] });

    await expect(
      guardFor({ userRole: 'admin' }).canActivate(context),
    ).resolves.toBe(true);
    expect(request.memberRole).toBe('owner');
    expect(request.organizationId).toBe('org');
  });

  it('keeps a platform admin who is a member at their member role', async () => {
    const { context } = contextFor({ organization: ['update'] });

    await expect(
      guardFor({ userRole: 'admin', memberRole: 'member' }).canActivate(
        context,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a user who is not a member', async () => {
    const { context } = contextFor(undefined);

    await expect(
      guardFor({ userRole: 'user' }).canActivate(context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a member without the action', async () => {
    const { context } = contextFor({ organization: ['update'] });

    await expect(
      guardFor({ userRole: 'user', memberRole: 'member' }).canActivate(context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps a closed organization read-only for a platform admin', async () => {
    const { context } = contextFor({ menu: ['update'] }, 'PATCH');

    await expect(
      guardFor({ userRole: 'admin', closed: true }).canActivate(context),
    ).rejects.toThrow();
  });
});
