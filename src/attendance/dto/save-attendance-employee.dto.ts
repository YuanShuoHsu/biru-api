import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class SaveAttendanceEmployeeDto {
  @IsOptional() @IsInt() @Min(1) @Max(2400) weeklyMinutes?: number;
  @IsOptional() @IsDateString() weeklyMinutesFrom?: string;
  @IsString() @MinLength(1) userId: string;
  @IsBoolean() enabled: boolean;
  @IsDateString() hiredAt: string;
  @IsOptional() @IsDateString() terminatedAt?: string;
}
