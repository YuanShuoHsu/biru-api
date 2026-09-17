import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class SaveAttendanceLeaveBalanceDto {
  @IsUUID() employeeId: string;
  @IsUUID() leaveTypeId: string;
  @IsInt() @Min(2000) @Max(2099) year: number;
  @IsInt() @Min(0) @Max(525600) grantedMinutes: number;
}
