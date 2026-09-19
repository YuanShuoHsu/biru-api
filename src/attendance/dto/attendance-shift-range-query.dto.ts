import { IsDateString } from 'class-validator';

export class AttendanceShiftRangeQueryDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
}
