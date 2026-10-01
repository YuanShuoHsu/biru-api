import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  attendanceErrorCodes,
  type AttendanceErrorCode,
  badRequestError,
} from '../attendance-errors';

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

export class ReviewLeaveCaseDto {
  @IsString() @MaxLength(100) reference: string;
  @IsDateString() eventDate: string;
  @IsDateString() startsAt: string;
  @ApiPropertyOptional({
    description: '產假、流產假由開始日加法定天數推得，其他假別必填',
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
  @IsOptional() @IsBoolean() extensionAgreed?: boolean;
}

export class ReviewAttendanceRequestDto {
  @IsOptional() @IsBoolean() medicalCertified?: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyWorkDto)
  emergency?: EmergencyWorkDto;
  @ApiPropertyOptional({
    description: '核准尚未核給額度的事件假時必填，核准時一併建立額度',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewLeaveCaseDto)
  leaveCase?: ReviewLeaveCaseDto;

  @IsIn(['approved', 'rejected']) status: 'approved' | 'rejected';
  @ApiPropertyOptional({ description: '駁回時必填' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export const reviewReasonOf = ({
  reason,
  status,
}: Pick<ReviewAttendanceRequestDto, 'reason' | 'status'>) => {
  const trimmed = reason?.trim() ?? '';
  if (status === 'rejected' && !trimmed)
    throw badRequestError('reasonRequired');
  return trimmed;
};

export class ReviewAttendanceBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  ids: string[];
  @IsIn(['approved', 'rejected']) status: 'approved' | 'rejected';
  @ApiPropertyOptional({ description: '駁回時必填' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class AttendanceBatchSkippedResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: attendanceErrorCodes, enumName: 'AttendanceErrorCode' })
  reason: AttendanceErrorCode;
}

export class AttendanceBatchResponseDto {
  @ApiProperty({ isArray: true, type: String }) succeeded: string[];
  @ApiProperty({ isArray: true, type: AttendanceBatchSkippedResponseDto })
  skipped: AttendanceBatchSkippedResponseDto[];
}
