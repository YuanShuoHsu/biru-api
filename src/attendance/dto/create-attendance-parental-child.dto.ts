import {
  IsDateString,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAttendanceParentalChildDto {
  @IsUUID() employeeId: string;
  @IsString() @MinLength(1) @MaxLength(100) reference: string;
  @IsString() @MinLength(1) @MaxLength(100) label: string;
  @IsDateString() birthDate: string;
}
