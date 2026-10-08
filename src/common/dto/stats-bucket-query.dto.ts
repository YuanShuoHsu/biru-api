import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, Max, Min } from 'class-validator';

export const STATS_BUCKET_UNITS = ['day', 'hour'] as const;
export type StatsBucketUnit = (typeof STATS_BUCKET_UNITS)[number];

export class StatsBucketQueryDto {
  @ApiProperty({
    description: '本期起始時間；上期為緊接在前、等長的區間',
    format: 'date-time',
  })
  @IsDateString()
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
