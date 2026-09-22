import { ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SaveAttendanceLeaveTypeDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  paidPercent?: number | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  requiresBalance?: boolean | null;
  @IsBoolean() enabled: boolean;
}
