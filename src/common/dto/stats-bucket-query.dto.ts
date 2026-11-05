import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsRFC3339, Max, Min } from 'class-validator';

export const STATS_BUCKET_UNITS = ['day', 'hour', 'month'] as const;
export type StatsBucketUnit = (typeof STATS_BUCKET_UNITS)[number];

export class StatsBucketQueryDto {
  @ApiProperty({
    description:
      '本期起始時間，須帶時區；上期為緊接在前、等長的區間，只取到和本期已經過的時間等長。bucketUnit 為 month 時須為平台時區的月初',
    example: '2026-11-01T00:00:00+08:00',
    format: 'date-time',
  })
  @IsRFC3339()
  @IsISO8601({ strict: true })
  since: string;

  @ApiProperty({ enum: STATS_BUCKET_UNITS, enumName: 'StatsBucketUnit' })
  @IsIn(STATS_BUCKET_UNITS)
  bucketUnit: StatsBucketUnit;

  @ApiProperty({ description: '每個區間包含幾個 bucketUnit', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  bucketSize: number;

  @ApiProperty({ description: '本期切成幾個區間', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(400)
  bucketCount: number;
}
