import { Module } from '@nestjs/common';

import { InventoryReportService } from './inventory-report.service.js';
import { ReportsController } from './reports.controller.js';
import { SalesReportService } from './sales-report.service.js';

@Module({
  controllers: [ReportsController],
  providers: [InventoryReportService, SalesReportService],
})
export class ReportsModule {}
