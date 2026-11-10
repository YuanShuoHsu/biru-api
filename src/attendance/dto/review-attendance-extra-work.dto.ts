import { OmitType } from '@nestjs/swagger';

import { IsISO8601, IsRFC3339 } from 'class-validator';

import { ReviewAttendanceRequestDto } from './review-attendance-request.dto.js';

export class ReviewAttendanceExtraWorkDto extends OmitType(
  ReviewAttendanceRequestDto,
  ['medicalCertified'] as const,
) {
  @IsRFC3339() @IsISO8601({ strict: true }) startsAt: string;
  @IsRFC3339() @IsISO8601({ strict: true }) endsAt: string;
}
