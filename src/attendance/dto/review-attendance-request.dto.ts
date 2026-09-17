import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class EmergencyWorkDto {
  @ApiProperty({
    enum: ['disaster', 'incident', 'unexpected'],
    enumName: 'AttendanceEmergencyCause',
  })
  @IsIn(['disaster', 'incident', 'unexpected'])
  cause: 'disaster' | 'incident' | 'unexpected';
  @IsDateString() reportedAt: string;
  @IsDateString() makeupStartsAt: string;
  @IsDateString() makeupEndsAt: string;
}

export class ReviewAttendanceRequestDto {
  @IsOptional() @IsBoolean() medicalCertified?: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyWorkDto)
  emergency?: EmergencyWorkDto;

  @IsIn(['approved', 'rejected']) status: 'approved' | 'rejected';
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}
