import { IsISO8601, IsRFC3339 } from 'class-validator';

export class AttendanceShiftRangeQueryDto {
  @IsRFC3339() @IsISO8601({ strict: true }) from: string;
  @IsRFC3339() @IsISO8601({ strict: true }) to: string;
}
