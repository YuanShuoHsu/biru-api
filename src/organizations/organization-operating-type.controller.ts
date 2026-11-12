import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { OrganizationMember } from '../menus/decorators/roles.decorator.js';

import {
  OperatingTypeResponseDto,
  UpdateOperatingTypeDto,
} from './dto/operating-type.dto.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@UseGuards(AdminGuard)
@Controller('organizations/:organizationId/operating-type')
export class OrganizationOperatingTypeController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: '門市經營型態（直營、加盟、未分類）' })
  @ApiOkResponse({ type: OperatingTypeResponseDto })
  get(
    @Param('organizationId') organizationId: string,
  ): Promise<OperatingTypeResponseDto> {
    return this.organizationsService.operatingType(organizationId);
  }

  @Put()
  @OrganizationMember('organizationId')
  @Audit({
    resource: 'organization',
    idSource: { column: 'organizationId', organization: true },
    via: { table: 'operatingType', ownerColumn: 'organizationId' },
  })
  @ApiOperation({ summary: '設定門市經營型態' })
  @ApiOkResponse({ type: OperatingTypeResponseDto })
  update(
    @Param('organizationId') organizationId: string,
    @Body() { operatingType }: UpdateOperatingTypeDto,
  ): Promise<OperatingTypeResponseDto> {
    return this.organizationsService.setOperatingType(
      organizationId,
      operatingType,
    );
  }
}
