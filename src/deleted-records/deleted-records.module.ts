import { Module } from '@nestjs/common';

import { AttendanceModule } from '../attendance/attendance.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';

import { DeletedRecordsController } from './deleted-records.controller.js';
import { DeletedRecordsService } from './deleted-records.service.js';
import { OrganizationDeletedRecordsController } from './organization-deleted-records.controller.js';

@Module({
  imports: [AttendanceModule, PayrollModule],
  controllers: [DeletedRecordsController, OrganizationDeletedRecordsController],
  providers: [DeletedRecordsService],
  exports: [DeletedRecordsService],
})
export class DeletedRecordsModule {}
