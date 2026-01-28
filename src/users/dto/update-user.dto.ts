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
import { GenderEnum } from 'src/common/enums/user';

export class UpdateUserDto {
  @ApiProperty({
    description: '生日',
    example: '2024-04-04',
    format: 'date',
  })
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  birthDate?: Date;

  @ApiProperty({ description: '國家代碼', example: 'TW' })
  @IsNotEmpty()
  @IsOptional()
  countryCode?: string;

  @ApiProperty({ description: '國家名稱', example: 'Taiwan' })
  @IsNotEmpty()
  @IsOptional()
  countryLabel?: string;

  @ApiProperty({ description: '國際電話區號', example: '+886' })
  @IsNotEmpty()
  @IsOptional()
  countryPhone?: string;

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
    enum: GenderEnum,
    example: GenderEnum.OTHER,
  })
  @IsEnum(GenderEnum)
  @IsOptional()
  gender?: GenderEnum;

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
    description: '聯絡電話（不含國碼）',
    example: '0123456789',
  })
  @IsNotEmpty()
  @IsOptional()
  phoneNumber?: string;
}
