import { ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAttendanceLeaveCaseDto {
  @IsOptional() @IsUUID() childId?: string;
  @IsOptional() @IsBoolean() earlyParentalAgreed?: boolean;
  @IsUUID() employeeId: string;
  @IsUUID() leaveTypeId: string;
  @ApiPropertyOptional({
    description: '育嬰留職停薪以子女區分，其他事件假必填',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
  @ApiPropertyOptional({
    description: '育嬰留職停薪取子女出生日，其他事件假必填',
  })
  @IsOptional()
  @IsDateString()
  eventDate?: string;
  @IsDateString() startsAt: string;
  @ApiPropertyOptional({
    description: '產假、流產假由開始日加法定天數推得，其他假別必填',
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
  @IsOptional() @IsBoolean() extensionAgreed?: boolean;
}
