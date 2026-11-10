import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsRFC3339,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trim } from '../../common/utils/trim.js';

export class CreateAttendanceAnnualLeaveDeferralDto {
  @IsUUID() employeeId: string;
  @IsRFC3339() @IsISO8601({ strict: true }) periodStart: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}
