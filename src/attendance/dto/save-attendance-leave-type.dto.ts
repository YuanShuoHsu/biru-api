import { Transform } from 'class-transformer';
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
  ValidateIf,
} from 'class-validator';
import { trim } from '../../common/utils/trim.js';

export class SaveAttendanceLeaveTypeDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) name: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  paidPercent?: number | null;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  requiresBalance?: boolean;
  @IsBoolean() enabled: boolean;
}
