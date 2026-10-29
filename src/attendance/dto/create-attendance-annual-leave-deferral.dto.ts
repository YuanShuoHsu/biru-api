import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trim } from '../../common/utils/trim.js';

export class CreateAttendanceAnnualLeaveDeferralDto {
  @IsUUID() employeeId: string;
  @IsDateString() periodStart: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}
