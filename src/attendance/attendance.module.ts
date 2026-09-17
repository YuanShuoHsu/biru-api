import { Module } from '@nestjs/common';

import { AttendanceEmployeesController } from './attendance-employees.controller';
import { AttendanceEmployeesService } from './attendance-employees.service';
import { AttendanceLeavesController } from './attendance-leaves.controller';
import { AttendanceLeavesService } from './attendance-leaves.service';
import { AttendanceParentalController } from './attendance-parental.controller';
import { AttendanceParentalService } from './attendance-parental.service';
import { AttendanceRequestsController } from './attendance-requests.controller';
import { AttendanceRequestsService } from './attendance-requests.service';
import { AttendanceShiftsController } from './attendance-shifts.controller';
import { AttendanceShiftsService } from './attendance-shifts.service';
import { AttendanceTemplatesController } from './attendance-templates.controller';
import { AttendanceTemplatesService } from './attendance-templates.service';

@Module({
  controllers: [
    AttendanceEmployeesController,
    AttendanceShiftsController,
    AttendanceTemplatesController,
    AttendanceRequestsController,
    AttendanceLeavesController,
    AttendanceParentalController,
  ],
  providers: [
    AttendanceEmployeesService,
    AttendanceShiftsService,
    AttendanceTemplatesService,
    AttendanceRequestsService,
    AttendanceLeavesService,
    AttendanceParentalService,
  ],
})
export class AttendanceModule {}
