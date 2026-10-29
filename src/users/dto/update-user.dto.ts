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
    description: '生日',
    example: '2024-04-04',
    format: 'date',
  })
  @IsDate()
  @IsNotEmpty()
  @IsOptional()
  @Type(() => Date)
  birthDate?: Date;

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
    description: '頭像 URL',
    example: 'https://example.com/avatar.png',
  })
  @IsNotEmpty()
  @IsOptional()
  @IsUrl()
  image?: string;

  @ApiPropertyOptional({ description: '姓', example: 'Biru' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    description: '聯絡電話（E.164 格式）',
    example: '+886912345678',
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
