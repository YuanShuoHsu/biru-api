import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { UNIT_FACTORS } from '../../common/constants/units.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';
import {
  type UnitCode,
  type WasteReason,
  wasteReasonEnum,
} from '../../db/schema/inventory.js';

const WASTE_COST_DESCRIPTION =
  '報廢量乘以登記當下的單位成本，小數點後兩位；任一筆報廢缺單位成本時為 null，無 purchasing 權限時不回傳';

class InventoryReportRowDto {
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

  @ApiProperty({
    description:
      '入庫：區間內盤點調增的數量合計；異動沒有進貨或更正之分，調增一律算入庫',
  })
  received: string;

  @ApiProperty({
    description: '耗用：區間內訂單扣庫存減去取消／全額退款回補的數量',
  })
  consumed: string;

  @ApiProperty({
    description: '報廢：區間內登記報廢的數量合計；不算進調整與實際耗用',
  })
  wasted: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: `報廢成本：${WASTE_COST_DESCRIPTION}`,
  })
  wastedCost?: string | null;

  @ApiProperty({
    description: '調整：區間內盤點調減的數量合計，為負數或 0；不含報廢',
  })
  adjusted: string;

  @ApiProperty({
    description: '期末：until 當下的帳上數量，等於期初＋入庫－耗用－報廢＋調整',
  })
  closing: string;

  @ApiProperty({
    description:
      '理論耗用：區間內扣庫存的訂單份數（含加購）減去區間內回補的訂單份數，乘以品項目前的配方用量；部分退款不回補，不扣份數',
  })
  theoreticalConsumption: string;

  @ApiProperty({
    description:
      '實際耗用：期初＋入庫－報廢－期末，即耗用減去調整；報廢另列，不算耗用',
  })
  actualConsumption: string;

  @ApiProperty({
    description:
      '差異：實際耗用減理論耗用，正數表示用得比目前配方多；登記的報廢不算進差異，盤點調增算入庫，不會抵銷差異',
  })
  variance: string;
}

class InventoryWasteReasonDto {
  @ApiProperty({ enum: wasteReasonEnum.enumValues, enumName: 'WasteReason' })
  reason: WasteReason;

  @ApiProperty({
    description: '報廢次數：同一次成品報廢展開的多筆食材異動算一次',
  })
  occurrences: number;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: `報廢成本：${WASTE_COST_DESCRIPTION}`,
  })
  cost?: string | null;
}

export class InventoryReportResponseDto {
  @ApiProperty({
    description:
      '店家目前所有食材，依食材排序；數量為小數點後三位的字串，與食材庫存相同',
    type: [InventoryReportRowDto],
  })
  rows: InventoryReportRowDto[];

  @ApiProperty({
    description:
      '區間內有報廢的原因，依原因的固定順序；各食材單位不同，只彙總次數與成本',
    type: [InventoryWasteReasonDto],
  })
  wasteByReason: InventoryWasteReasonDto[];
}
