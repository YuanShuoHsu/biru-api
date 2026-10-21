import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { hasBusinessRecords } from '../auth/deletion-guards.js';
import { OrganizationMember } from '../menus/decorators/roles.decorator.js';

import { OrganizationDeletabilityDto } from './dto/organization-deletability.dto.js';

@ApiTags('organizations')
@Controller('organizations/:organizationId/deletability')
export class OrganizationDeletabilityController {
  @Get()
  @OrganizationMember('organizationId')
  @ApiOperation({ summary: '查詢組織是否可刪除' })
  @ApiOkResponse({ type: OrganizationDeletabilityDto })
  async findOne(
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationDeletabilityDto> {
    return { deletable: !(await hasBusinessRecords(organizationId)) };
  }
}
