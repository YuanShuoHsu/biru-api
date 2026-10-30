import { ApiProperty } from '@nestjs/swagger';

import { IsDateString } from 'class-validator';

export class ReportRangeQueryDto {
  @ApiProperty({ description: '統計起始時間', format: 'date-time' })
  @IsDateString()
  since: string;

  @ApiProperty({
    description: '統計結束時間（不含）；須晚於 since，區間最多 366 天',
    format: 'date-time',
  })
  @IsDateString()
  until: string;
}
