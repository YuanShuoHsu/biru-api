import { Module } from '@nestjs/common';

import { PayrollModule } from 'src/payroll/payroll.module';

import { TasksService } from './tasks.service';

@Module({
  imports: [PayrollModule],
  providers: [TasksService],
})
export class TasksModule {}
