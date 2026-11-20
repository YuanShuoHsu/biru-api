import { Module } from '@nestjs/common';

import { PayrollModule } from '../payroll/payroll.module.js';

import { BreakEvenReportService } from './break-even-report.service.js';
import { InventoryReportService } from './inventory-report.service.js';
import { PersonnelCostReportService } from './personnel-cost-report.service.js';
import { ReportCsvService } from './report-csv.service.js';
import { ReportsController } from './reports.controller.js';
import { SalesReportService } from './sales-report.service.js';

@Module({
  imports: [PayrollModule],
  controllers: [ReportsController],
  providers: [
    BreakEvenReportService,
    InventoryReportService,
    PersonnelCostReportService,
    ReportCsvService,
    SalesReportService,
  ],
})
export class ReportsModule {}
