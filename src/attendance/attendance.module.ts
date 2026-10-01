import { Module } from '@nestjs/common';

import { MailsModule } from 'src/mails/mails.module';

import { AttendanceEmployeesController } from './attendance-employees.controller';
import { AttendanceEmployeesService } from './attendance-employees.service';
import { AttendanceLeavesController } from './attendance-leaves.controller';
import { AttendanceLeavesService } from './attendance-leaves.service';
import { AttendanceNotificationsService } from './attendance-notifications.service';
import { AttendanceParentalController } from './attendance-parental.controller';
import { AttendanceParentalService } from './attendance-parental.service';
import { AttendanceRequestsController } from './attendance-requests.controller';
import { AttendanceRequestsService } from './attendance-requests.service';
import { AttendanceShiftTypesController } from './attendance-shift-types.controller';
import { AttendanceShiftTypesService } from './attendance-shift-types.service';
import { AttendanceShiftsController } from './attendance-shifts.controller';
import { AttendanceShiftsService } from './attendance-shifts.service';

@Module({
  imports: [MailsModule],
  controllers: [
    AttendanceEmployeesController,
    AttendanceShiftTypesController,
    AttendanceShiftsController,
    AttendanceRequestsController,
    AttendanceLeavesController,
    AttendanceParentalController,
  ],
  providers: [
    AttendanceEmployeesService,
    AttendanceShiftTypesService,
    AttendanceShiftsService,
    AttendanceRequestsService,
    AttendanceLeavesService,
    AttendanceNotificationsService,
    AttendanceParentalService,
  ],
})
export class AttendanceModule {}
