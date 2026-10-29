import { ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import {
  DEFAULT_GENDER,
  type Gender,
  gendersEnum,
} from '../../db/schema/enums.js';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: '生日；送 null 清除',
    example: '2024-04-04',
    format: 'date',
    nullable: true,
  })
  @IsDate()
  @IsNotEmpty()
  @IsOptional()
  @Type(() => Date)
  birthDate?: Date | null;

  @ApiPropertyOptional({
    description: '是否訂閱電子報',
    example: true,
  })
  @IsBoolean()
  @ValidateIf((_, value) => value !== undefined)
  emailSubscribed?: boolean;

  @ApiPropertyOptional({ description: '名', example: 'Coffee' })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value !== undefined)
  firstName?: string;

  @ApiPropertyOptional({
    description: '性別',
    enum: gendersEnum.enumValues,
    example: DEFAULT_GENDER,
  })
  @IsEnum(gendersEnum.enumValues)
  @IsNotEmpty()
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({
    description: '頭像 URL；送 null 清除',
    example: 'https://example.com/avatar.png',
    nullable: true,
  })
  @IsNotEmpty()
  @IsOptional()
  @IsUrl()
  image?: string | null;

  @ApiPropertyOptional({
    description: '姓；送空字串或 null 清除',
    example: 'Biru',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  lastName?: string | null;

  @ApiPropertyOptional({
    description: '聯絡電話（E.164 格式）；送空字串或 null 清除',
    example: '+886912345678',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string | null;
}
