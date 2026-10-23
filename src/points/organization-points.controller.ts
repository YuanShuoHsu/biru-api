import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { Audit } from '../common/decorators/audit.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { AdjustPointsDto } from './dto/adjust-points.dto.js';
import { OrganizationPointTransactionQueryDto } from './dto/organization-point-transaction-query.dto.js';
import {
  OrganizationPointTransactionDto,
  OrganizationPointTransactionListResponseDto,
} from './dto/points-response.dto.js';
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

  @Post('adjustments')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit('pointTransaction', { response: true })
  @ApiOperation({
    summary: '為會員手動補點或扣點；扣點只扣本店發出且未過期的剩餘點數',
  })
  @ApiCreatedResponse({ type: OrganizationPointTransactionDto })
  adjust(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: AdjustPointsDto,
    @Session() session: UserSession,
  ): Promise<OrganizationPointTransactionDto> {
    return this.pointsService.adjustForOrganization(
      organizationSlug,
      dto,
      session.user.id,
    );
  }
}
