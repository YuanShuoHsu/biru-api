import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IMAGE_DATA_URL_MAX_LENGTH } from '../../common/constants/image.js';
import { IsLocalizedText } from '../../common/decorators/is-localized-text.decorator.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import { emptyLocalizedTextToNull } from '../../common/utils/localized-text.js';
import {
  servingTemperatureEnum,
  servingTemperatureLevelEnum,
  sweetnessEnum,
  sweetnessLevelEnum,
  type LocalizedText,
  type ServingTemperature,
  type ServingTemperatureLevel,
  type Sweetness,
  type SweetnessLevel,
} from '../../db/schema/enums.js';
import {
  restrictedDietEnum,
  type NutritionInformation,
  type RestrictedDiet,
} from '../../db/schema/menus.js';
import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';

import { CreateOfferDto } from './create-offer.dto.js';
import { NutritionInformationDto } from './nutrition-information.dto.js';

const servingTemperatureOrder = (value: ServingTemperature) => {
  const index = servingTemperatureEnum.enumValues.indexOf(value);

  return index === -1 ? Infinity : index;
};

export class CreateMenuItemDto {
  @ApiProperty({
    type: LocalizedTextDto,
    example: { 'zh-TW': '拿鐵', en: 'Latte' },
  })
  @IsLocalizedText()
  name: LocalizedText;

  @ApiPropertyOptional({ type: LocalizedTextDto, nullable: true })
  @IsOptional()
  @IsLocalizedText()
  @Transform(({ value }: { value: unknown }) => emptyLocalizedTextToNull(value))
  description?: LocalizedText | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(IMAGE_DATA_URL_MAX_LENGTH)
  image?: string | null;

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
  @ValidateIf((_, value) => value !== undefined)
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
    description: '推薦的溫度細項；須屬於可供應的冷熱，否則存 null',
    enum: servingTemperatureLevelEnum.enumValues,
    enumName: 'ServingTemperatureLevel',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(servingTemperatureLevelEnum.enumValues)
  recommendedServingTemperatureLevel?: ServingTemperatureLevel | null;

  @ApiPropertyOptional({
    description: '甜度：不適用、固定、可調；省略代表不適用',
    enum: sweetnessEnum.enumValues,
    enumName: 'Sweetness',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(sweetnessEnum.enumValues)
  sweetness?: Sweetness;

  @ApiPropertyOptional({
    description:
      '甜度固定時的等級；sweetness 為 Fixed 時必填，其他情況一律存 null',
    enum: sweetnessLevelEnum.enumValues,
    enumName: 'SweetnessLevel',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(sweetnessLevelEnum.enumValues)
  fixedSweetnessLevel?: SweetnessLevel | null;

  @ApiPropertyOptional({
    description:
      '推薦的甜度；僅 sweetness 為 Adjustable 時可設，其他情況一律存 null',
    enum: sweetnessLevelEnum.enumValues,
    enumName: 'SweetnessLevel',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(sweetnessLevelEnum.enumValues)
  recommendedSweetnessLevel?: SweetnessLevel | null;

  @ApiPropertyOptional({
    description: '可販售的點餐模式；省略代表四種全開',
    enum: orderModeEnum.enumValues,
    enumName: 'OrderMode',
    isArray: true,
  })
  @ValidateIf((_, value) => value !== undefined)
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

  @ApiPropertyOptional({
    description: '工作單印表機；null 時沿用所屬分類',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  orderTicketPrinterId?: string | null;
}
