import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AdminGuard } from '../common/guards/admin.guard.js';
import { ROLES_KEY } from '../menus/decorators/roles.decorator.js';

import { OrganizationClosureController } from './organization-closure.controller.js';

describe('OrganizationClosureController', () => {
  it('只有平台管理員能停業或復業', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, OrganizationClosureController),
    ).toEqual([AdminGuard]);
  });

  it.each(['close', 'reopen'] as const)(
    '%s 經過 RolesGuard 解析門市，異動紀錄才記得到門市 id',
    (method) => {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          Object.getOwnPropertyDescriptor(
            OrganizationClosureController.prototype,
            method,
          )?.value as object,
        ),
      ).toEqual({ organizationParam: 'organizationId' });
    },
  );
});
