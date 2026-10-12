import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from 'src/common/decorators/audit.decorator';
import { AdminGuard } from 'src/common/guards/admin.guard';

import { OrganizationResponseDto } from './dto/organization-response.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@UseGuards(AdminGuard)
@Controller('organizations/:organizationId')
export class OrganizationClosureController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post('close')
  @Audit('organization', { param: 'organizationId' })
  @ApiOperation({ summary: '停業：從門市列表下架，店員僅能查看' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  close(
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.setClosed(organizationId, true);
  }

  @Post('reopen')
  @Audit('organization', { param: 'organizationId' })
  @ApiOperation({ summary: '復業' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  reopen(
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.setClosed(organizationId, false);
  }
}
