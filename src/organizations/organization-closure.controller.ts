import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { OrganizationMember } from '../menus/decorators/roles.decorator.js';

import { OrganizationResponseDto } from './dto/organization-response.dto.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@UseGuards(AdminGuard)
@Controller('organizations/:organizationId')
export class OrganizationClosureController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post('close')
  @OrganizationMember('organizationId')
  @Audit('organization', { param: 'organizationId' })
  @ApiOperation({ summary: '停業：從門市列表下架，店員僅能查看' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  close(
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.setClosed(organizationId, true);
  }

  @Post('reopen')
  @OrganizationMember('organizationId')
  @Audit('organization', { param: 'organizationId' })
  @ApiOperation({ summary: '復業' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  reopen(
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.setClosed(organizationId, false);
  }
}
