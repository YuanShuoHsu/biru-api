import { Module } from '@nestjs/common';

import { AttendanceModule } from 'src/attendance/attendance.module';
import { PayrollModule } from 'src/payroll/payroll.module';

import { DeletedRecordsController } from './deleted-records.controller';
import { DeletedRecordsService } from './deleted-records.service';
import { OrganizationDeletedRecordsController } from './organization-deleted-records.controller';

@Module({
  imports: [AttendanceModule, PayrollModule],
  controllers: [DeletedRecordsController, OrganizationDeletedRecordsController],
  providers: [DeletedRecordsService],
  exports: [DeletedRecordsService],
})
export class DeletedRecordsModule {}
