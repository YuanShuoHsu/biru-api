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
  banned = false,
  client: { handshake: { headers: object }; data: Record<string, unknown> } = {
    handshake: { headers: {} },
    data: {},
  },
) => {
  const guard = new WsRolesGuard(
    new Reflector(),
    {
      api: {
        getSession: vi.fn().mockResolvedValue({ user: { id: 'user' } }),
      },
    } as unknown as AuthService<Auth>,
    {
      query: {
        user: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'user',
              role: userRole,
              banned,
              banExpires: null,
              members: memberRole ? [{ role: memberRole }] : [],
            },
          ]),
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
      getClient: () => client,
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

  it('rejects a banned owner', async () => {
    await expect(canActivate('user', 'owner', true)).rejects.toBeInstanceOf(
      WsException,
    );
  });

  it('records the authorized user on the socket', async () => {
    const client = { handshake: { headers: {} }, data: {} };

    await canActivate('user', 'owner', false, client);

    expect(client.data).toEqual({ userId: 'user' });
  });
});
