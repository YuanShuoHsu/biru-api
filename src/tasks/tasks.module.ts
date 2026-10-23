import { Module } from '@nestjs/common';

import { AttendanceModule } from '../attendance/attendance.module.js';
import { DeletedRecordsModule } from '../deleted-records/deleted-records.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { WaitlistModule } from '../waitlist/waitlist.module.js';

import { TasksService } from './tasks.service.js';

@Module({
  imports: [
    AttendanceModule,
    DeletedRecordsModule,
    InventoryModule,
    OrdersModule,
    PayrollModule,
    WaitlistModule,
  ],
  providers: [TasksService],
})
export class TasksModule {}
