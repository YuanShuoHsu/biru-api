import {
  IsDateString,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAttendanceAnnualLeaveDeferralDto {
  @IsUUID() employeeId: string;
  @IsDateString() periodStart: string;
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}
