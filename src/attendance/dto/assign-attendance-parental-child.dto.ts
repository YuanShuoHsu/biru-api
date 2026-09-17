import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AssignAttendanceParentalChildDto {
  @IsUUID() childId: string;
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}
