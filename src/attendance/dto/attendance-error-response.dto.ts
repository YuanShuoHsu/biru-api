import { ApiProperty } from '@nestjs/swagger';

import {
  attendanceErrorCodes,
  type AttendanceErrorCode,
} from '../attendance-errors';

export class AttendanceErrorResponseDto {
  @ApiProperty({ enum: attendanceErrorCodes, enumName: 'AttendanceErrorCode' })
  message: AttendanceErrorCode;
  @ApiProperty({ example: 'Conflict' }) error: string;
  @ApiProperty() statusCode: number;
  @ApiProperty() path: string;
  @ApiProperty() success: boolean;
  @ApiProperty() timestamp: string;
}
