import { Transform } from 'class-transformer';
import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/utils/trim.js';

export class CreateAttendanceParentalReturnDto {
  @IsDateString() returnsAt: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}
