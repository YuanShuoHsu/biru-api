import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import {
  PAYROLL_VIOLATIONS,
  type PayrollViolation,
} from '../../db/schema/payroll.js';

export class PayrollReviewDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  reason?: string;
  @ApiPropertyOptional({
    enum: PAYROLL_VIOLATIONS,
    enumName: 'PayrollViolation',
    isArray: true,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsIn(PAYROLL_VIOLATIONS, { each: true })
  acknowledgedViolations?: PayrollViolation[];
}

export class PayrollBatchReviewDto extends PayrollReviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  ids: string[];
}
