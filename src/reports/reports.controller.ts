import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

import { OrganizationId } from '../menus/decorators/organization-id.decorator.js';
import { HasPermission } from '../menus/decorators/permission.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { BreakEvenReportService } from './break-even-report.service.js';
import {
  BreakEvenReportPageQueryDto,
  BreakEvenReportQueryDto,
  BreakEvenReportResponseDto,
} from './dto/break-even-report.dto.js';
import {
  InventoryReportPageQueryDto,
  InventoryReportResponseDto,
} from './dto/inventory-report.dto.js';
import {
  PersonnelCostReportPageQueryDto,
  PersonnelCostReportQueryDto,
  PersonnelCostReportResponseDto,
} from './dto/personnel-cost-report.dto.js';
import { ReportRangeQueryDto } from './dto/report-range-query.dto.js';
import {
  SalesReportPageQueryDto,
  SalesReportQueryDto,
  SalesReportResponseDto,
} from './dto/sales-report.dto.js';
import { InventoryReportService } from './inventory-report.service.js';
import { PersonnelCostReportService } from './personnel-cost-report.service.js';
import { ReportCsvService } from './report-csv.service.js';
import { SalesReportService } from './sales-report.service.js';

const csvFile = (csv: string, filename: string) =>
  new StreamableFile(Buffer.from(csv), {
    type: 'text/csv; charset=utf-8',
    disposition: `attachment; filename="${filename}"`,
  });

@ApiTags('reports')
@ApiParam({ name: 'organizationSlug', type: String })
@Controller('organizations/:organizationSlug/reports')
export class ReportsController {
  constructor(
    private readonly breakEvenReportService: BreakEvenReportService,
    private readonly inventoryReportService: InventoryReportService,
    private readonly personnelCostReportService: PersonnelCostReportService,
    private readonly reportCsvService: ReportCsvService,
    private readonly salesReportService: SalesReportService,
  ) {}

  @Get('sales')
  @Roles({ revenue: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢銷售報表' })
  @ApiOkResponse({ type: SalesReportResponseDto })
  findSales(
    @OrganizationId() organizationId: string,
    @Query() query: SalesReportPageQueryDto,
  ): Promise<SalesReportResponseDto> {
    return this.salesReportService.getSalesReport(organizationId, query);
  }

  @Get('sales/export.csv')
  @Roles({ revenue: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '匯出銷售報表 CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  exportSales(
    @OrganizationId() organizationId: string,
    @Query() query: SalesReportQueryDto,
  ): Promise<StreamableFile> {
    return this.reportCsvService
      .sales(organizationId, query)
      .then((csv) => csvFile(csv, 'sales-report.csv'));
  }

  @Get('inventory')
  @Roles({ inventoryTransaction: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢庫存報表' })
  @ApiOkResponse({ type: InventoryReportResponseDto })
  findInventory(
    @OrganizationId() organizationId: string,
    @Query() query: InventoryReportPageQueryDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<InventoryReportResponseDto> {
    return this.inventoryReportService.getInventoryReport(
      organizationId,
      query,
      canReadPurchasing,
    );
  }

  @Get('inventory/export.csv')
  @Roles({ inventoryTransaction: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '匯出庫存報表 CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  exportInventory(
    @OrganizationId() organizationId: string,
    @Query() query: ReportRangeQueryDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<StreamableFile> {
    return this.reportCsvService
      .inventory(organizationId, query, canReadPurchasing)
      .then((csv) => csvFile(csv, 'inventory-report.csv'));
  }
  @Get('personnel')
  @Roles({ payslip: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢人事成本報表' })
  @ApiOkResponse({ type: PersonnelCostReportResponseDto })
  findPersonnel(
    @OrganizationId() organizationId: string,
    @Query() query: PersonnelCostReportPageQueryDto,
  ): Promise<PersonnelCostReportResponseDto> {
    return this.personnelCostReportService.getPersonnelCostReport(
      organizationId,
      query,
    );
  }

  @Get('personnel/export.csv')
  @Roles({ payslip: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '匯出人事成本報表 CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  exportPersonnel(
    @OrganizationId() organizationId: string,
    @Query() query: PersonnelCostReportQueryDto,
  ): Promise<StreamableFile> {
    return this.reportCsvService
      .personnel(organizationId, query.month)
      .then((csv) => csvFile(csv, 'personnel-report.csv'));
  }

  @Get('break-even')
  @Roles({ operatingCost: ['read'] }, 'organizationSlug')
  @ApiOperation({
    summary: '查詢損益平衡報表：固定成本、銷貨成本、營業稅與每日需求營業額',
  })
  @ApiOkResponse({ type: BreakEvenReportResponseDto })
  findBreakEven(
    @OrganizationId() organizationId: string,
    @Query() query: BreakEvenReportPageQueryDto,
  ): Promise<BreakEvenReportResponseDto> {
    return this.breakEvenReportService.getBreakEvenReport(
      organizationId,
      query,
    );
  }

  @Get('break-even/export.csv')
  @Roles({ operatingCost: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '匯出損益平衡報表的品項毛利 CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  exportBreakEven(
    @OrganizationId() organizationId: string,
    @Query() query: BreakEvenReportQueryDto,
  ): Promise<StreamableFile> {
    return this.reportCsvService
      .breakEven(organizationId, query)
      .then((csv) => csvFile(csv, 'break-even-report.csv'));
  }
}
