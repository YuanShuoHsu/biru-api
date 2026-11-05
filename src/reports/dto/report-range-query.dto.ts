import { ApiProperty } from '@nestjs/swagger';

import { IsISO8601, IsRFC3339 } from 'class-validator';

export class ReportRangeQueryDto {
  @ApiProperty({
    description: '統計起始時間，須帶時區',
    example: '2026-11-01T00:00:00+08:00',
    format: 'date-time',
  })
  @IsRFC3339()
  @IsISO8601({ strict: true })
  since: string;

  @ApiProperty({
    description:
      '統計結束時間（不含），須帶時區；須晚於 since，區間最多 366 天',
    example: '2026-12-01T00:00:00+08:00',
    format: 'date-time',
  })
  @IsRFC3339()
  @IsISO8601({ strict: true })
  until: string;
}
