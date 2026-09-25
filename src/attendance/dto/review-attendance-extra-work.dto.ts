import { OmitType } from '@nestjs/swagger';

import { IsDateString } from 'class-validator';

import { ReviewAttendanceRequestDto } from './review-attendance-request.dto';

export class ReviewAttendanceExtraWorkDto extends OmitType(
  ReviewAttendanceRequestDto,
  ['medicalCertified'] as const,
) {
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
}
