import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PayrollEarningInputDto } from './payroll-earning.dto';

export class PayrollDraftDto {
  @IsUUID() idempotencyKey: string;
  @IsUUID() employeeId: string;
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) month: string;
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PayrollEarningInputDto)
  earnings?: PayrollEarningInputDto[];
}
