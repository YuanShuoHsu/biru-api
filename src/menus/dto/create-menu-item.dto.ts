import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IMAGE_DATA_URL_MAX_LENGTH } from 'src/common/constants/image';
import { emptyLocalizedTextToNull } from 'src/common/utils/localized-text';
import type { LocalizedText } from 'src/db/schema/enums';
import {
  restrictedDietEnum,
  servingTemperatureEnum,
  type NutritionInformation,
  type RestrictedDiet,
  type ServingTemperature,
} from 'src/db/schema/menus';
import { orderModeEnum, type OrderMode } from 'src/db/schema/orders';

import { CreateOfferDto } from './create-offer.dto';
import { NutritionInformationDto } from './nutrition-information.dto';

const servingTemperatureOrder = (value: ServingTemperature) => {
  const index = servingTemperatureEnum.enumValues.indexOf(value);

  return index === -1 ? Infinity : index;
};

export class CreateMenuItemDto {
  @ApiProperty({ example: { 'zh-TW': '拿鐵', en: 'Latte' } })
  @IsObject()
  name: LocalizedText;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsObject()
  @Transform(({ value }: { value: unknown }) => emptyLocalizedTextToNull(value))
  description?: LocalizedText | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(IMAGE_DATA_URL_MAX_LENGTH)
  image?: string;

  @ApiPropertyOptional({ enum: restrictedDietEnum.enumValues, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(restrictedDietEnum.enumValues, { each: true })
  suitableForDiet?: RestrictedDiet[];

  @ApiPropertyOptional({
    description: '可供應的飲品溫度；省略代表不適用',
    enum: servingTemperatureEnum.enumValues,
    enumName: 'ServingTemperature',
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(servingTemperatureEnum.enumValues, { each: true })
  // 去重並依 enum 順序排序，同一組溫度在 DB 只有一種寫法；非法值保留給 @IsEnum 擋
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? [...new Set(value)].sort(
          (a, b) =>
            servingTemperatureOrder(a as ServingTemperature) -
            servingTemperatureOrder(b as ServingTemperature),
        )
      : value,
  )
  servingTemperatures?: ServingTemperature[];

  @ApiPropertyOptional({
    description: '可販售的點餐模式；省略代表四種全開',
    enum: orderModeEnum.enumValues,
    enumName: 'OrderMode',
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(orderModeEnum.enumValues, { each: true })
  availableModes?: OrderMode[];

  @ApiPropertyOptional({ type: NutritionInformationDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NutritionInformationDto)
  nutrition?: NutritionInformation;

  @ApiPropertyOptional({ type: CreateOfferDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOfferDto)
  offer?: CreateOfferDto;
}
