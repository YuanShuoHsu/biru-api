import { OmitType } from '@nestjs/swagger';

import { CreateAttendanceParentalChildDto } from './create-attendance-parental-child.dto.js';

export class UpdateAttendanceParentalChildDto extends OmitType(
  CreateAttendanceParentalChildDto,
  ['employeeId'] as const,
) {}
