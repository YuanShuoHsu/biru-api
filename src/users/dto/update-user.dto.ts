import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUrl,
} from 'class-validator';
import { DEFAULT_GENDER, type Gender, gendersEnum } from 'src/db/schema/enums';

export class UpdateUserDto {
  @ApiProperty({
    description: '生日',
    example: '2024-04-04',
    format: 'date',
  })
  @IsDate()
  @IsNotEmpty()
  @IsOptional()
  @Type(() => Date)
  birthDate?: Date;

  @ApiProperty({
    description: '是否訂閱電子報',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  emailSubscribed?: boolean;

  @ApiProperty({ description: '名', example: 'Coffee' })
  @IsNotEmpty()
  @IsOptional()
  firstName?: string;

  @ApiProperty({
    description: '性別',
    enum: gendersEnum.enumValues,
    example: DEFAULT_GENDER,
  })
  @IsEnum(gendersEnum.enumValues)
  @IsNotEmpty()
  @IsOptional()
  gender?: Gender;

  @ApiProperty({
    description: '頭像 URL',
    example: 'https://example.com/avatar.png',
  })
  @IsNotEmpty()
  @IsOptional()
  @IsUrl()
  image?: string;

  @ApiProperty({ description: '姓', example: 'Biru' })
  @IsOptional()
  lastName?: string;

  @ApiProperty({
    description: '聯絡電話（E.164 格式）',
    example: '+886912345678',
  })
  @IsNotEmpty()
  @IsOptional()
  phoneNumber?: string;
}
