import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../menus/decorators/roles.decorator.js';

import {
  SalesReportQueryDto,
  SalesReportResponseDto,
} from './dto/sales-report.dto.js';
import { SalesReportService } from './sales-report.service.js';

@ApiTags('reports')
@Controller('organizations/:organizationSlug/reports')
export class ReportsController {
  constructor(private readonly salesReportService: SalesReportService) {}

  @Get('sales')
  @Roles({ revenue: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢銷售報表' })
  @ApiOkResponse({ type: SalesReportResponseDto })
  findSales(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: SalesReportQueryDto,
  ): Promise<SalesReportResponseDto> {
    return this.salesReportService.getSalesReport(organizationSlug, query);
  }
}
