import { ApiProperty } from '@nestjs/swagger';

import { IsEnum } from 'class-validator';
import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from '../../db/schema/menus.js';

export class UpdateItemAvailabilityDto {
  @ApiProperty({
    enum: itemAvailabilityEnum.enumValues,
    enumName: 'ItemAvailability',
  })
  @IsEnum(itemAvailabilityEnum.enumValues)
  availability: ItemAvailability;
}
