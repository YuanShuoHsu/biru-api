import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import type { AuthService } from '@thallesp/nestjs-better-auth';

import type { Auth } from '../../auth/index.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

import { WsRolesGuard } from './ws-roles.guard.js';

const canActivate = (
  userRole: string,
  memberRole?: 'owner' | 'admin' | 'member',
) => {
  const guard = new WsRolesGuard(
    new Reflector(),
    {
      api: {
        getSession: vi
          .fn()
          .mockResolvedValue({ user: { id: 'user', role: userRole } }),
      },
    } as unknown as AuthService<Auth>,
    {
      query: {
        member: {
          findFirst: vi
            .fn()
            .mockResolvedValue(memberRole ? { role: memberRole } : undefined),
        },
      },
    } as unknown as DrizzleDB,
  );
  const handler = () => undefined;
  Reflect.defineMetadata(
    'roles',
    {
      action: { organization: ['update'] },
      organizationParam: 'organizationId',
    },
    handler,
  );

  return guard.canActivate({
    getClass: () => class {},
    getHandler: () => handler,
    switchToWs: () => ({
      getClient: () => ({ handshake: { headers: {} } }),
      getData: () => ({ organizationId: 'org' }),
    }),
  } as unknown as ExecutionContext);
};

describe('WsRolesGuard', () => {
  it('lets a platform admin who is not a member act as the owner', async () => {
    await expect(canActivate('admin')).resolves.toBe(true);
  });

  it('lets a platform admin who is a lower-role member act as the owner', async () => {
    await expect(canActivate('admin', 'member')).resolves.toBe(true);
  });

  it('rejects a member without the action', async () => {
    await expect(canActivate('user', 'member')).rejects.toBeInstanceOf(
      WsException,
    );
  });

  it('rejects a user who is not a member', async () => {
    await expect(canActivate('user')).rejects.toBeInstanceOf(WsException);
  });
});
