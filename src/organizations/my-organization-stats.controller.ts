import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { StatsBucketQueryDto } from 'src/common/dto/stats-bucket-query.dto';

import { OrganizationStatsResponseDto } from './dto/organization-stats.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller('users/me/organization-stats')
export class MyOrganizationStatsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: '查詢我所屬組織的統計' })
  @ApiOkResponse({ type: OrganizationStatsResponseDto })
  getStats(
    @Session() session: UserSession,
    @Query() query: StatsBucketQueryDto,
  ): Promise<OrganizationStatsResponseDto> {
    return this.organizationsService.getMemberStats(session.user.id, query);
  }
}
