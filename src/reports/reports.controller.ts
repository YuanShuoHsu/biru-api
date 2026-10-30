import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../menus/decorators/roles.decorator.js';

import { InventoryReportResponseDto } from './dto/inventory-report.dto.js';
import { ReportRangeQueryDto } from './dto/report-range-query.dto.js';
import {
  SalesReportQueryDto,
  SalesReportResponseDto,
} from './dto/sales-report.dto.js';
import { InventoryReportService } from './inventory-report.service.js';
import { SalesReportService } from './sales-report.service.js';

@ApiTags('reports')
@Controller('organizations/:organizationSlug/reports')
export class ReportsController {
  constructor(
    private readonly inventoryReportService: InventoryReportService,
    private readonly salesReportService: SalesReportService,
  ) {}

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

  @Get('inventory')
  @Roles({ inventoryTransaction: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢庫存報表' })
  @ApiOkResponse({ type: InventoryReportResponseDto })
  findInventory(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: ReportRangeQueryDto,
  ): Promise<InventoryReportResponseDto> {
    return this.inventoryReportService.getInventoryReport(
      organizationSlug,
      query,
    );
  }
}
