import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AUDIT_KEY } from '../common/decorators/audit.decorator.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { ROLES_KEY } from '../menus/decorators/roles.decorator.js';

import { OrganizationOperatingTypeController } from './organization-operating-type.controller.js';

const handler = (method: 'get' | 'update') =>
  Object.getOwnPropertyDescriptor(
    OrganizationOperatingTypeController.prototype,
    method,
  )?.value as object;

describe('OrganizationOperatingTypeController', () => {
  it('只有平台管理員能查詢或設定', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, OrganizationOperatingTypeController),
    ).toEqual([AdminGuard]);
  });

  it('設定會經過 RolesGuard 解析門市，異動紀錄記在該門市的店家設定', () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler('update'))).toEqual({
      organizationParam: 'organizationId',
    });
    expect(Reflect.getMetadata(AUDIT_KEY, handler('update'))).toEqual([
      {
        resource: 'organization',
        idSource: { column: 'organizationId', organization: true },
        via: { table: 'operatingType', ownerColumn: 'organizationId' },
      },
    ]);
  });
});
