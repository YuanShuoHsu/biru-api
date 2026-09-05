import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from 'src/db/schema/enums';

export class SupplierResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() telephone: string | null;
  @ApiPropertyOptional() url: string | null;
  @ApiPropertyOptional() note: string | null;
  @ApiProperty({ description: '此供應商有採購規格的食材' })
  ingredientNames: LocalizedText[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
