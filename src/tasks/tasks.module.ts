import { Module } from '@nestjs/common';

import { PayrollModule } from 'src/payroll/payroll.module';
import { WaitlistModule } from 'src/waitlist/waitlist.module';

import { TasksService } from './tasks.service';

@Module({
  imports: [PayrollModule, WaitlistModule],
  providers: [TasksService],
})
export class TasksModule {}
