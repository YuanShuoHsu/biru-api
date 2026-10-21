import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { StatsBucketQueryDto } from '../common/dto/stats-bucket-query.dto.js';

import { OrganizationStatsResponseDto } from './dto/organization-stats.dto.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@Controller('users/me/organization-stats')
export class MyOrganizationStatsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({
    summary: '查詢組織統計；平台管理員為全平台，其他人為所屬組織',
  })
  @ApiOkResponse({ type: OrganizationStatsResponseDto })
  getStats(
    @Session() session: UserSession,
    @Query() query: StatsBucketQueryDto,
  ): Promise<OrganizationStatsResponseDto> {
    return this.organizationsService.getStats(
      session.user.role === 'admin' ? null : session.user.id,
      query,
    );
  }
}
