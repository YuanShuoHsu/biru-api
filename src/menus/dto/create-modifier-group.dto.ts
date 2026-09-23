import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsEnum, IsInt, IsObject, IsOptional, Min } from 'class-validator';
import {
  servingTemperatureEnum,
  type LocalizedText,
  type ServingTemperature,
} from 'src/db/schema/enums';

export class CreateModifierGroupDto {
  @ApiProperty({
    description: '群組名稱，如「甜度」「加料」',
    example: { 'zh-TW': '甜度', en: 'Sweetness' },
  })
  @IsObject()
  displayName: LocalizedText;

  @ApiPropertyOptional({
    default: 0,
    description: '最少選擇數量；>= 1 代表必選',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minSelectionCount?: number;

  @ApiPropertyOptional({
    nullable: true,
    description: '最多選擇數量；min=max=1 為單選，null 為不限',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelectionCount?: number | null;

  @ApiPropertyOptional({
    description:
      '僅在客人選擇此溫度時提供，如冰量只給冰飲；省略或 null 代表不限',
    enum: servingTemperatureEnum.enumValues,
    enumName: 'ServingTemperature',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(servingTemperatureEnum.enumValues)
  servingTemperature?: ServingTemperature | null;
}
