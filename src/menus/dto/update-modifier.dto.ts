import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';

import type { ItemAvailability } from 'src/db/schema/menus';
import { itemAvailabilityEnum } from 'src/db/schema/menus';

export class UpdateModifierDto {
  @ApiPropertyOptional({ description: '選項名稱' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ description: '加價金額', example: '10.00' })
  @IsOptional()
  @IsNumberString()
  priceAdjustment?: string;

  @ApiPropertyOptional({ enum: itemAvailabilityEnum.enumValues })
  @IsOptional()
  @IsEnum(itemAvailabilityEnum.enumValues)
  availability?: ItemAvailability;
}
