import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import {
  OrganizationWifiResponseDto,
  UpdateOrganizationWifiDto,
} from './dto/organization-wifi.dto.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@Controller('organizations/:organizationSlug/wifi')
export class OrganizationWifiController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '門市 Wi-Fi 名稱與密碼（印在內用桌卡上）' })
  @ApiOkResponse({ type: OrganizationWifiResponseDto })
  get(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<OrganizationWifiResponseDto> {
    return this.organizationsService.wifi(organizationSlug);
  }

  @Put()
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit({
    resource: 'organization',
    idSource: { column: 'organizationId', organization: true },
    via: { table: 'organizationWifi', ownerColumn: 'organizationId' },
  })
  @ApiOperation({ summary: '設定門市 Wi-Fi 名稱與密碼，留空則桌卡不印' })
  @ApiOkResponse({ type: OrganizationWifiResponseDto })
  update(
    @Param('organizationSlug') organizationSlug: string,
    @Body() body: UpdateOrganizationWifiDto,
  ): Promise<OrganizationWifiResponseDto> {
    return this.organizationsService.setWifi(organizationSlug, body);
  }
}
