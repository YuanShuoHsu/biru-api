import { Module } from '@nestjs/common';

import { MailsModule } from '../mails/mails.module.js';

import { AttendanceEmployeesController } from './attendance-employees.controller.js';
import { AttendanceEmployeesService } from './attendance-employees.service.js';
import { AttendanceLeavesController } from './attendance-leaves.controller.js';
import { AttendanceLeavesService } from './attendance-leaves.service.js';
import { AttendanceNotificationsService } from './attendance-notifications.service.js';
import { AttendanceParentalController } from './attendance-parental.controller.js';
import { AttendanceParentalService } from './attendance-parental.service.js';
import { AttendanceRequestsController } from './attendance-requests.controller.js';
import { AttendanceRequestsService } from './attendance-requests.service.js';
import { AttendanceShiftTypesController } from './attendance-shift-types.controller.js';
import { AttendanceShiftTypesService } from './attendance-shift-types.service.js';
import { AttendanceShiftsController } from './attendance-shifts.controller.js';
import { AttendanceShiftsService } from './attendance-shifts.service.js';

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
  exports: [
    AttendanceEmployeesService,
    AttendanceLeavesService,
    AttendanceNotificationsService,
    AttendanceParentalService,
    AttendanceShiftTypesService,
  ],
})
export class AttendanceModule {}
