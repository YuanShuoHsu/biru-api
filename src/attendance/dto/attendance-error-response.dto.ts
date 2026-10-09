import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  attendanceErrorCodes,
  type AttendanceErrorCode,
} from '../attendance-errors';

export class AttendanceErrorResponseDto {
  @ApiProperty({ enum: attendanceErrorCodes, enumName: 'AttendanceErrorCode' })
  message: AttendanceErrorCode;
  @ApiPropertyOptional({
    description: 'cancelIrreversible 時，班次無法通過的排班規則',
    enum: attendanceErrorCodes,
    enumName: 'AttendanceErrorCode',
  })
  reason?: AttendanceErrorCode;
  @ApiProperty({ example: 'Conflict' }) error: string;
  @ApiProperty() statusCode: number;
  @ApiProperty() path: string;
  @ApiProperty() success: boolean;
  @ApiProperty() timestamp: string;
}
