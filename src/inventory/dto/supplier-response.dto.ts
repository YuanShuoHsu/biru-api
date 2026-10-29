import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class SupplierIngredientResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: LocalizedTextDto }) name: LocalizedText;
}

export class SupplierResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() telephone: string | null;
  @ApiPropertyOptional() url: string | null;
  @ApiPropertyOptional() note: string | null;
  @ApiProperty({
    isArray: true,
    type: SupplierIngredientResponseDto,
    description: '由這家供應的食材',
  })
  ingredients: SupplierIngredientResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class SupplierListResponseDto {
  @ApiProperty({ type: [SupplierResponseDto] }) data: SupplierResponseDto[];
  @ApiProperty() total: number;
}
