import { ROLES_KEY } from '../menus/decorators/roles.decorator.js';

import { OrganizationPlatformAdminController } from './organization-platform-admin.controller.js';

const handler = Object.getOwnPropertyDescriptor(
  OrganizationPlatformAdminController.prototype,
  'platformAdminMemberIds',
)?.value as object;

describe('OrganizationPlatformAdminController', () => {
  it('門市的任何成員都能列出身為平台管理員的成員', () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual({
      organizationParam: 'organizationId',
    });
  });
});
