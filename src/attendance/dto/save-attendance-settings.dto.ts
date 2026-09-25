import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
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
  @ApiPropertyOptional({ example: '01234567A', nullable: true, type: String })
  @IsOptional()
  @Matches(/^\d{8}[A-Z]$/)
  laborInsuranceUnitCode?: string | null;
  @ApiPropertyOptional({
    description: '勞保局核定的行業別職災費率（百萬分率，不含上下班費率）',
    example: 1200,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  occupationalAccidentRateMicros?: number | null;
  @ApiProperty({
    description:
      '經工會或勞資會議同意延長工時的各期起始月（每期連續 3 個曆月）',
    example: ['2026-01', '2026-04'],
  })
  @IsArray()
  @ArrayMaxSize(40)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { each: true })
  overtimeExtensionPeriods: string[];
}
