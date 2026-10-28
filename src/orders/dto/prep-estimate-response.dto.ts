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
  @ApiProperty({
    description:
      '估算採用的備餐分鐘數：門市備餐時間與此品項設定的備餐時間取大者，不含加購',
  })
  leadTimeMinutes: number;
  @ApiProperty({
    description:
      '近 14 天含此品項、非預約的已出餐訂單，從付款（未付款則下單）到可取餐的整張單分鐘數中位數，含同單其他品項與排隊等待；樣本不足 5 筆時為 null',
    nullable: true,
    type: Number,
  })
  medianMinutes: number | null;
  @ApiProperty({
    description: '近 14 天含此品項、非預約的已出餐訂單數',
  })
  sampleSize: number;
}
