import { OmitType } from '@nestjs/swagger';

import { CreateAttendanceParentalChildDto } from './create-attendance-parental-child.dto';

export class UpdateAttendanceParentalChildDto extends OmitType(
  CreateAttendanceParentalChildDto,
  ['employeeId'] as const,
) {}
