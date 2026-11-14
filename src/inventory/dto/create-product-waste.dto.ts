import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import {
  type WasteReason,
  wasteReasonEnum,
} from '../../db/schema/inventory.js';

export class CreateProductWasteDto {
  @ApiProperty({ description: '報廢的菜單品項，依它的食譜展開食材用量' })
  @IsUUID()
  menuItemId: string;

  @ApiProperty({ example: 1, description: '報廢的份數' })
  @IsInt()
  @Min(1)
  @Max(9999)
  servings: number;

  @ApiPropertyOptional({
    type: [String],
    description: '這幾份加上的客製選項，有食譜的選項每份各展開一次',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  modifierIds?: string[];

  @ApiProperty({ enum: wasteReasonEnum.enumValues, enumName: 'WasteReason' })
  @IsEnum(wasteReasonEnum.enumValues)
  wasteReason: WasteReason;

  @ApiPropertyOptional({ description: '異動原因，自由填寫' })
  @IsOptional()
  @IsString()
  note?: string | null;
}
