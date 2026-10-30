import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trim } from '../../common/utils/trim.js';

export class CreateAttendanceParentalChildDto {
  @IsUUID() employeeId: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) reference: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) label: string;
  @IsDateString() birthDate: string;
}
