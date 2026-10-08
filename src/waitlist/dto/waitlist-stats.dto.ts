import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsDateString } from 'class-validator';

export class WaitlistStatsQueryDto {
  @ApiProperty({
    description: '統計起始時間（以取號時間計）',
    format: 'date-time',
  })
  @IsDateString()
  since: string;
}

export class WaitlistStatsResponseDto {
  @ApiProperty({ description: '期間內取號組數，含仍在進行中的號碼牌' })
  total: number;
  @ApiProperty() seated: number;
  @ApiProperty() noShow: number;
  @ApiProperty({ description: '含顧客取消與店員取消' })
  cancelled: number;
  @ApiProperty({ description: '逾 24 小時未處理而自動作廢' })
  expired: number;
  @ApiPropertyOptional({
    description: '已入座號碼牌從取號到入座的分鐘數中位數，無入座為 null',
  })
  medianWaitMinutes: number | null;
  @ApiProperty({
    description: '依店家時區各小時（0–23）的取號組數',
    type: [Number],
  })
  hourlyTickets: number[];
}
