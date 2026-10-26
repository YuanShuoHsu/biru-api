import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ApiLocalizedTextProperty } from '../../common/decorators/api-localized-text-property.decorator.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class SupplierIngredientResponseDto {
  @ApiProperty() id: string;
  @ApiLocalizedTextProperty() name: LocalizedText;
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
