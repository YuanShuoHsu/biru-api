import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class SaveAttendanceEmployeeDto {
  @IsString() @MinLength(1) userId: string;
  @IsBoolean() enabled: boolean;
  @IsDateString() hiredAt: string;
  @IsOptional() @IsDateString() terminatedAt?: string;
}
