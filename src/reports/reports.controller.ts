import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../menus/decorators/roles.decorator.js';

import { InventoryReportResponseDto } from './dto/inventory-report.dto.js';
import { ReportRangeQueryDto } from './dto/report-range-query.dto.js';
import {
  SalesReportQueryDto,
  SalesReportResponseDto,
} from './dto/sales-report.dto.js';
import { InventoryReportService } from './inventory-report.service.js';
import { ReportCsvService } from './report-csv.service.js';
import { SalesReportService } from './sales-report.service.js';

const csvFile = (csv: string, filename: string) =>
  new StreamableFile(Buffer.from(csv), {
    type: 'text/csv; charset=utf-8',
    disposition: `attachment; filename="${filename}"`,
  });

@ApiTags('reports')
@Controller('organizations/:organizationSlug/reports')
export class ReportsController {
  constructor(
    private readonly inventoryReportService: InventoryReportService,
    private readonly reportCsvService: ReportCsvService,
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

  @Get('sales/export.csv')
  @Roles({ revenue: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '匯出銷售報表 CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  exportSales(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: SalesReportQueryDto,
  ): Promise<StreamableFile> {
    return this.reportCsvService
      .sales(organizationSlug, query)
      .then((csv) => csvFile(csv, 'sales-report.csv'));
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

  @Get('inventory/export.csv')
  @Roles({ inventoryTransaction: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '匯出庫存報表 CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  exportInventory(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: ReportRangeQueryDto,
  ): Promise<StreamableFile> {
    return this.reportCsvService
      .inventory(organizationSlug, query)
      .then((csv) => csvFile(csv, 'inventory-report.csv'));
  }
}
