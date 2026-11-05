import { Module } from '@nestjs/common';

import { InventoryReportService } from './inventory-report.service.js';
import { PersonnelCostReportService } from './personnel-cost-report.service.js';
import { ReportCsvService } from './report-csv.service.js';
import { ReportsController } from './reports.controller.js';
import { SalesReportService } from './sales-report.service.js';

@Module({
  controllers: [ReportsController],
  providers: [
    InventoryReportService,
    PersonnelCostReportService,
    ReportCsvService,
    SalesReportService,
  ],
})
export class ReportsModule {}
