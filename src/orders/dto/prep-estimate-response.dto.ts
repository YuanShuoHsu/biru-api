import { ApiProperty } from '@nestjs/swagger';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class PrepEstimateResponseDto {
  @ApiProperty({ enum: ['observed', 'leadTime'] })
  basis: 'observed' | 'leadTime';
  @ApiProperty({ description: '無條件進位到 5 分鐘' })
  estimatedMinutes: number;
  @ApiProperty({ description: '計入估算的製作中訂單數' })
  queuedOrders: number;
}

export class PrepTimeResponseDto {
  @ApiProperty()
  menuItemId: string;
  @ApiProperty({ type: LocalizedTextDto })
  name: LocalizedText;
  @ApiProperty({ description: '設定的備餐時間（分鐘）' })
  leadTimeMinutes: number;
  @ApiProperty({
    description: '近 14 天含此品項訂單的平均製作分鐘數；樣本不足 5 筆時為 null',
    nullable: true,
    type: Number,
  })
  averageMinutes: number | null;
  @ApiProperty({ description: '近 14 天含此品項且已出餐的訂單數' })
  sampleSize: number;
}
