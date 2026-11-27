import { ApiPropertyOptional, PickType } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumberString,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';

import { PriceSpecificationDto } from '../../menus/dto/create-offer.dto.js';
import { CreateMenuItemDto } from '../../menus/dto/create-menu-item.dto.js';

export class CreateCatalogItemDto extends PickType(CreateMenuItemDto, [
  'name',
  'description',
  'image',
  'suitableForDiet',
  'servingTemperatures',
  'recommendedServingTemperatureLevel',
  'sweetness',
  'fixedSweetnessLevel',
  'recommendedSweetnessLevel',
  'nutrition',
]) {
  @ApiPropertyOptional({
    description: '建議售價；門市沒有自訂售價時使用',
    example: '150.00',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  @IsNumberString()
  suggestedPrice?: string | null;

  @ApiPropertyOptional({
    description: '品牌促銷價；只套用在跟隨品牌售價的門市',
    type: PriceSpecificationDto,
    nullable: true,
  })
  @IsOptional()
  @Type(() => PriceSpecificationDto)
  @ValidateNested()
  priceSpecification?: PriceSpecificationDto | null;

  @ApiPropertyOptional({ description: '停止供應，所有門市一起下架' })
  @IsOptional()
  @IsBoolean()
  discontinued?: boolean;
}
