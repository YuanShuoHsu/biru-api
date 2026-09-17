import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAttendanceLeaveCaseDto {
  @IsOptional() @IsUUID() childId?: string;
  @IsOptional() @IsBoolean() earlyParentalAgreed?: boolean;
  @IsOptional() @Matches(/^\d{1,12}$/) dailyPayCents?: string;
  @IsUUID() employeeId: string;
  @IsUUID() leaveTypeId: string;
  @IsString() @MinLength(1) @MaxLength(100) reference: string;
  @IsDateString() eventDate: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
  @IsOptional() @IsBoolean() extensionAgreed?: boolean;
}
