// src/users/dto/update-profile.dto.ts

import { ApiProperty } from '@nestjs/swagger';

import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUrl,
} from 'class-validator';
import type { Gender } from 'prisma/generated/client';
import { Gender as GenderEnum } from 'prisma/generated/enums';

export class UpdateUserDto {
  @ApiProperty({
    description: '生日',
    example: '2024-04-04',
  })
  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @ApiProperty({ description: '電話國碼', example: '+886' })
  @IsNotEmpty()
  @IsOptional()
  countryCode?: string;

  @ApiProperty({ description: '名', example: 'Coffee' })
  @IsNotEmpty()
  @IsOptional()
  firstName?: string;

  @ApiProperty({
    description: '性別',
    enum: GenderEnum,
    example: GenderEnum.NOT_DISCLOSED,
  })
  @IsEnum(GenderEnum)
  @IsOptional()
  gender?: Gender;

  @ApiProperty({
    description: '頭像 URL',
    example: 'https://example.com/avatar.png',
  })
  @IsOptional()
  @IsUrl()
  image?: string;

  @ApiProperty({ description: '姓', example: 'Biru' })
  @IsNotEmpty()
  @IsOptional()
  lastName?: string;

  @ApiProperty({
    description: '聯絡電話',
    example: '0912345678',
  })
  @IsNotEmpty()
  @IsOptional()
  phone?: string;
}
