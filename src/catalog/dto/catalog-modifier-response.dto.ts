import { ApiProperty, PickType } from '@nestjs/swagger';

import {
  cupSealEnum,
  cupSizeEnum,
  type CupSeal,
  type CupSize,
} from '../../db/schema/enums.js';
import { ModifierResponseDto } from '../../menus/dto/modifier-response.dto.js';

export class CatalogModifierResponseDto extends PickType(ModifierResponseDto, [
  'id',
  'displayName',
  'imageUrl',
  'sortOrder',
  'createdAt',
  'updatedAt',
]) {
  @ApiProperty()
  catalogModifierGroupId: string;

  @ApiProperty({
    description: '建議加價；null 代表不影響價格',
    nullable: true,
    type: String,
    example: '10.00',
  })
  priceAdjustment: string | null;

  @ApiProperty({ description: '客人自備杯' })
  customerProvidedCup: boolean;

  @ApiProperty({
    description: '這個選項指定的杯型',
    enum: cupSizeEnum.enumValues,
    enumName: 'CupSize',
    nullable: true,
  })
  cupSize: CupSize | null;

  @ApiProperty({
    description: '這個選項指定的封口',
    enum: cupSealEnum.enumValues,
    enumName: 'CupSeal',
    nullable: true,
  })
  cupSeal: CupSeal | null;
}

export class CatalogModifierListResponseDto {
  @ApiProperty({ type: [CatalogModifierResponseDto] })
  data: CatalogModifierResponseDto[];
  @ApiProperty() total: number;
}
