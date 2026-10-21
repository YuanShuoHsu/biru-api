import { Module } from '@nestjs/common';

import { AttendanceModule } from 'src/attendance/attendance.module';
import { DeletedRecordsModule } from 'src/deleted-records/deleted-records.module';
import { PayrollModule } from 'src/payroll/payroll.module';
import { WaitlistModule } from 'src/waitlist/waitlist.module';

import { TasksService } from './tasks.service';

@Module({
  imports: [
    AttendanceModule,
    DeletedRecordsModule,
    PayrollModule,
    WaitlistModule,
  ],
  providers: [TasksService],
})
export class TasksModule {}
