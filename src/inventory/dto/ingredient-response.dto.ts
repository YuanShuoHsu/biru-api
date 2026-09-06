import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { UNIT_FACTORS } from 'src/common/constants/units';
import type { LocalizedText } from 'src/db/schema/enums';
import type { UnitCode } from 'src/db/schema/inventory';

export class IngredientResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() name: LocalizedText;
  @ApiPropertyOptional() brand: string | null;
  @ApiPropertyOptional() image: string | null;
  @ApiPropertyOptional({ description: '無 purchasing 權限時不回傳' })
  supplierId?: string | null;
  @ApiPropertyOptional({ description: '無 purchasing 權限時不回傳' })
  supplierName?: string | null;
  @ApiProperty({ enum: Object.keys(UNIT_FACTORS), enumName: 'UnitCode' })
  unitCode: UnitCode;
  @ApiProperty() inventoryLevel: string;
  @ApiPropertyOptional() lowStockThreshold: string | null;
  @ApiPropertyOptional({
    description: '一個包裝的價錢；無 purchasing 權限時不回傳',
  })
  price?: string | null;
  @ApiProperty() priceCurrency: string;
  @ApiPropertyOptional() eligibleQuantity: string | null;
  @ApiPropertyOptional({
    enum: Object.keys(UNIT_FACTORS),
    enumName: 'UnitCode',
    description: 'eligibleQuantity 的單位',
  })
  eligibleQuantityUnitCode: UnitCode | null;
  @ApiPropertyOptional({ description: '採購連結；無 purchasing 權限時不回傳' })
  url?: string | null;
  @ApiPropertyOptional({ description: '每基準單位價格' })
  unitPrice?: number | null;
  @ApiPropertyOptional({ description: '包裝量，與 eligibleQuantity 相同' })
  packageQuantity: string | null;
  @ApiPropertyOptional({
    enum: Object.keys(UNIT_FACTORS),
    enumName: 'UnitCode',
    description: 'packageQuantity 的單位',
  })
  packageUnitCode: UnitCode | null;
  @ApiPropertyOptional({ description: '一個包裝換算為基準單位的量' })
  packageBaseQuantity: number | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
