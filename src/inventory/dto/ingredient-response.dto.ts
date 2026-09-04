import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { UNIT_FACTORS } from 'src/common/constants/units';
import type { LocalizedText } from 'src/db/schema/enums';
import type { UnitCode } from 'src/db/schema/inventory';

export class IngredientOfferResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() ingredientId: string;
  @ApiPropertyOptional() supplierId: string | null;
  @ApiPropertyOptional() supplierName: string | null;
  @ApiProperty() price: string;
  @ApiProperty() priceCurrency: string;
  @ApiProperty() eligibleQuantity: string;
  @ApiProperty({
    enum: Object.keys(UNIT_FACTORS),
    enumName: 'UnitCode',
  })
  eligibleQuantityUnitCode: UnitCode;
  @ApiProperty({ description: '每基準單位價格' }) unitPrice: number;
  @ApiPropertyOptional() url: string | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class IngredientResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() name: LocalizedText;
  @ApiPropertyOptional() brand: string | null;
  @ApiPropertyOptional() image: string | null;
  @ApiProperty({ enum: Object.keys(UNIT_FACTORS), enumName: 'UnitCode' })
  unitCode: UnitCode;
  @ApiProperty() inventoryLevel: string;
  @ApiPropertyOptional() lowStockThreshold: string | null;
  @ApiPropertyOptional({ description: '取排序第一筆採購規格換算' })
  unitPrice: number | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
