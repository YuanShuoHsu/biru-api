import { Module } from '@nestjs/common';

import { ReportsController } from './reports.controller.js';
import { SalesReportService } from './sales-report.service.js';

@Module({
  controllers: [ReportsController],
  providers: [SalesReportService],
})
export class ReportsModule {}
