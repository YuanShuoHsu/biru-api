import { ApiPropertyOptional, PickType } from '@nestjs/swagger';

import { IsBoolean, IsEnum, IsOptional, ValidateIf } from 'class-validator';

import {
  cupSealEnum,
  cupSizeEnum,
  type CupSeal,
  type CupSize,
} from '../../db/schema/enums.js';
import { CreateModifierDto } from '../../menus/dto/create-modifier.dto.js';

export class CreateCatalogModifierDto extends PickType(CreateModifierDto, [
  'displayName',
  'image',
  'priceAdjustment',
]) {
  @ApiPropertyOptional({
    description:
      '客人自備杯：每杯扣自備杯折扣（最低 0），收杯前這杯不排工作單；省略代表否',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  customerProvidedCup?: boolean;

  @ApiPropertyOptional({
    description: '這個選項指定的杯型；null 代表不指定',
    enum: cupSizeEnum.enumValues,
    enumName: 'CupSize',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(cupSizeEnum.enumValues)
  cupSize?: CupSize | null;

  @ApiPropertyOptional({
    description: '這個選項指定的封口；null 代表不指定',
    enum: cupSealEnum.enumValues,
    enumName: 'CupSeal',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(cupSealEnum.enumValues)
  cupSeal?: CupSeal | null;
}
