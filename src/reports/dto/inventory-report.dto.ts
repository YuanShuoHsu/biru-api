import { ApiProperty } from '@nestjs/swagger';

import { UNIT_FACTORS } from '../../common/constants/units.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';
import type { UnitCode } from '../../db/schema/inventory.js';

export class InventoryReportRowDto {
  @ApiProperty() ingredientId: string;

  @ApiProperty({ type: LocalizedTextDto }) name: LocalizedText;

  @ApiProperty({
    enum: Object.keys(UNIT_FACTORS),
    enumName: 'UnitCode',
    description: '以下數量皆為此單位',
  })
  unitCode: UnitCode;

  @ApiProperty({ description: '期初：since 當下的帳上數量' })
  opening: string;

  @ApiProperty({ description: '入庫：區間內盤點調增的數量合計' })
  received: string;

  @ApiProperty({
    description: '耗用：區間內訂單扣庫存減去取消／全額退款回補的數量',
  })
  consumed: string;

  @ApiProperty({ description: '調整：區間內盤點調減的數量合計，為負數或 0' })
  adjusted: string;

  @ApiProperty({
    description: '期末：until 當下的帳上數量，等於期初＋入庫－耗用＋調整',
  })
  closing: string;

  @ApiProperty({
    description:
      '理論耗用：區間內售出份數（含加購，扣除退款份數，口徑同銷售報表）乘以品項目前的配方用量',
  })
  theoreticalConsumption: string;

  @ApiProperty({
    description: '實際耗用：期初＋入庫－期末，即耗用減去調整',
  })
  actualConsumption: string;

  @ApiProperty({
    description: '差異：實際耗用減理論耗用，正數表示用得比配方多',
  })
  variance: string;
}

export class InventoryReportResponseDto {
  @ApiProperty({
    description:
      '店家目前所有食材，依食材排序；數量為小數點後三位的字串，與食材庫存相同',
    type: [InventoryReportRowDto],
  })
  rows: InventoryReportRowDto[];
}
