import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { PGlite } from '@electric-sql/pglite';
import type { AuthService } from '@thallesp/nestjs-better-auth';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../../test/pglite.js';
import type { Auth } from '../../auth/index.js';
import * as schema from '../../db/schema/index.js';
import { menu, menuItem } from '../../db/schema/menus.js';
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

  it('lets a platform admin who is a lower-role member act as the owner', async () => {
    const { context, request } = contextFor({ organization: ['update'] });

    await expect(
      guardFor({ userRole: 'admin', memberRole: 'member' }).canActivate(
        context,
      ),
    ).resolves.toBe(true);
    expect(request.memberRole).toBe('owner');
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

  it.each([{ refund: ['create'] }, { invoice: ['void'] }])(
    'still lets a closed organization refund and void invoices (%o)',
    async (action) => {
      const { context } = contextFor(action, 'POST');

      await expect(
        guardFor({
          userRole: 'user',
          memberRole: 'member',
          closed: true,
        }).canActivate(context),
      ).resolves.toBe(true);
    },
  );

  it('keeps a closed organization read-only for a platform admin', async () => {
    const { context } = contextFor({ menu: ['update'] }, 'PATCH');

    await expect(
      guardFor({ userRole: 'admin', closed: true }).canActivate(context),
    ).rejects.toThrow(/read-only/);
  });
});

describe('RolesGuard 由路由參數找門市', () => {
  let client: PGlite;
  let guard: RolesGuard;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
    `);
    await db.insert(menu).values({
      id: 'menu',
      organizationId: 'biru',
      name: { 'zh-TW': '菜單' },
    });
    await db.insert(menuItem).values({
      id: 'unsectioned',
      menuId: 'menu',
      name: { 'zh-TW': '未分類品項' },
      sortOrder: 0,
    });
    guard = new RolesGuard(
      new Reflector(),
      {
        api: {
          getSession: vi
            .fn()
            .mockResolvedValue({ user: { id: 'user', role: 'admin' } }),
        },
      } as unknown as AuthService<Auth>,
      db as unknown as DrizzleDB,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('沒有分類的品項也從它的菜單找到門市', async () => {
    const request = {
      headers: {},
      method: 'GET',
      params: { menuItemId: 'unsectioned' },
    } as unknown as AuthRequest;
    const handler = () => undefined;
    Reflect.defineMetadata(
      'roles',
      { action: { menu: ['read'] }, organizationParam: 'menuItemId' },
      handler,
    );

    await expect(
      guard.canActivate({
        getClass: () => class {},
        getHandler: () => handler,
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext),
    ).resolves.toBe(true);
    expect(request.organizationId).toBe('biru');
  });
});
