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
  type NutritionInformation,
  type RestrictedDiet,
} from 'src/db/schema/menus';
import { orderModeEnum, type OrderMode } from 'src/db/schema/orders';

import { CreateOfferDto } from './create-offer.dto';
import { NutritionInformationDto } from './nutrition-information.dto';

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
