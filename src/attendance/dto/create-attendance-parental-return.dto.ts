import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAttendanceParentalReturnDto {
  @IsDateString() returnsAt: string;
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}
