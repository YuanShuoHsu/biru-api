import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HasPermission } from '../menus/decorators/permission.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { StatsBucketQueryDto } from '../common/dto/stats-bucket-query.dto.js';

import { OrderStatsResponseDto } from './dto/order-stats.dto.js';
import { OrderStatsService } from './order-stats.service.js';

@ApiTags('orders')
@Controller('organizations/:organizationSlug/order-stats')
export class OrderStatsController {
  constructor(private readonly orderStatsService: OrderStatsService) {}

  @Get()
  @Roles({ order: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢訂單統計' })
  @ApiOkResponse({ type: OrderStatsResponseDto })
  findOne(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: StatsBucketQueryDto,
    @HasPermission({ revenue: ['read'] }) canReadRevenue: boolean,
  ): Promise<OrderStatsResponseDto> {
    return this.orderStatsService.getStats(
      organizationSlug,
      query,
      canReadRevenue,
    );
  }
}
