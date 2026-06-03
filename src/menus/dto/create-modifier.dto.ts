import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';

import type { ItemAvailability } from 'src/db/schema/menus';
import { itemAvailabilityEnum } from 'src/db/schema/menus';

export class CreateModifierDto {
  @ApiProperty({ description: '選項名稱，如「半糖」「珍珠」' })
  @IsString()
  displayName: string;

  @ApiPropertyOptional({
    description: '加價金額；省略代表不影響價格',
    example: '10.00',
  })
  @IsOptional()
  @IsNumberString()
  priceAdjustment?: string;

  @ApiPropertyOptional({ enum: itemAvailabilityEnum.enumValues })
  @IsOptional()
  @IsEnum(itemAvailabilityEnum.enumValues)
  availability?: ItemAvailability;
}
