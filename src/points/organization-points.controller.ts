import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../menus/decorators/roles.decorator.js';

import { OrganizationPointTransactionQueryDto } from './dto/organization-point-transaction-query.dto.js';
import { OrganizationPointTransactionListResponseDto } from './dto/points-response.dto.js';
import { PointsService } from './points.service.js';

@ApiTags('points')
@Controller('organizations/:organizationSlug/point-transactions')
export class OrganizationPointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get()
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢本店發出與收回的會員點數明細' })
  @ApiOkResponse({ type: OrganizationPointTransactionListResponseDto })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: OrganizationPointTransactionQueryDto,
  ): Promise<OrganizationPointTransactionListResponseDto> {
    return this.pointsService.findAllForOrganization(organizationSlug, query);
  }
}
