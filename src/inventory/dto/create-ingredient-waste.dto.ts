import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

import {
  type WasteReason,
  wasteReasonEnum,
} from '../../db/schema/inventory.js';

export class CreateIngredientWasteDto {
  @ApiProperty({
    example: '250.000',
    description: '報廢的數量，單位為食材的 unitCode',
  })
  @Matches(/^(?=.*[1-9])\d{1,9}(\.\d{1,3})?$/)
  @IsNumberString()
  quantity: string;

  @ApiProperty({ enum: wasteReasonEnum.enumValues, enumName: 'WasteReason' })
  @IsEnum(wasteReasonEnum.enumValues)
  wasteReason: WasteReason;

  @ApiPropertyOptional({ description: '異動原因，自由填寫' })
  @IsOptional()
  @IsString()
  note?: string | null;
}
