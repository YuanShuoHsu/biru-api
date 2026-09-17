import { ApiProperty } from '@nestjs/swagger';

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class SaveAttendanceSettingsDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsInt() @Min(10) @Max(10000) radiusMeters: number;
  @ApiProperty({ example: ['203.0.113.7', '2001:db8::/32'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @Matches(/^[\d.:a-fA-F]{2,45}(\/\d{1,3})?$/, { each: true })
  allowedIps: string[];
  @IsInt() @Min(0) @Max(60) graceMinutes: number;
}
