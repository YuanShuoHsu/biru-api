import { AUDIT_KEY } from '../common/decorators/audit.decorator.js';
import { ROLES_KEY } from '../menus/decorators/roles.decorator.js';

import { OrganizationWifiController } from './organization-wifi.controller.js';

const handler = (method: 'get' | 'update') =>
  Object.getOwnPropertyDescriptor(OrganizationWifiController.prototype, method)
    ?.value as object;

describe('OrganizationWifiController', () => {
  it('查詢與設定都需要門市設定的修改權限', () => {
    for (const method of ['get', 'update'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, handler(method))).toEqual({
        action: { organization: ['update'] },
        organizationParam: 'organizationSlug',
      });
    }
  });

  it('設定的異動紀錄記在該門市的店家設定', () => {
    expect(Reflect.getMetadata(AUDIT_KEY, handler('update'))).toEqual([
      {
        resource: 'organization',
        idSource: { column: 'organizationId', organization: true },
        via: { table: 'organizationWifi', ownerColumn: 'organizationId' },
      },
    ]);
  });
});
