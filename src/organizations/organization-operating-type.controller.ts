import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { AdminGuard } from '../common/guards/admin.guard.js';

import { OrganizationResponseDto } from './dto/organization-response.dto.js';
import { UpdateOperatingTypeDto } from './dto/update-operating-type.dto.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@UseGuards(AdminGuard)
@Controller('organizations/:organizationId')
export class OrganizationOperatingTypeController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Patch('operating-type')
  @Audit('organization', { param: 'organizationId' })
  @ApiOperation({ summary: '設定門市經營型態（直營、加盟、未分類）' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  update(
    @Param('organizationId') organizationId: string,
    @Body() { operatingType }: UpdateOperatingTypeDto,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.setOperatingType(
      organizationId,
      operatingType,
    );
  }
}
