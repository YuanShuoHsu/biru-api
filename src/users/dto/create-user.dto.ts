import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  Matches,
  MinLength,
} from 'class-validator';
import type { Gender } from 'prisma/generated/client';
import { Gender as GenderEnum } from 'prisma/generated/enums';

export class CreateUserDto {
  @ApiProperty({
    description: '生日',
    example: '2024-04-04',
    format: 'date',
  })
  @IsDate()
  @Type(() => Date)
  birthDate: Date;

  @ApiProperty({
    description: '國家代碼',
    example: 'TW',
  })
  @IsNotEmpty()
  countryCode: string;

  @ApiProperty({
    description: '國家名稱',
    example: 'Taiwan',
  })
  @IsNotEmpty()
  countryLabel: string;

  @ApiProperty({
    description: '國際電話區號',
    example: '+886',
  })
  @IsNotEmpty()
  countryPhone: string;

  @ApiProperty({
    description: '電子郵件',
    example: 'birucoffee@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '名', example: 'Coffee' })
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    description: '性別',
    enum: GenderEnum,
    example: GenderEnum.OTHER,
  })
  @IsEnum(GenderEnum)
  gender: Gender;

  @ApiProperty({
    description: '是否訂閱電子報',
    example: true,
  })
  @IsBoolean()
  isSubscribed: boolean;

  @ApiProperty({
    description: '偏好語言',
    example: 'zh-TW',
  })
  @IsNotEmpty()
  lang: string;

  @ApiProperty({ description: '姓（選填）', example: 'Biru' })
  @IsOptional()
  lastName?: string;

  @ApiProperty({
    description: '密碼（至少 8 碼，需包含英文字母與數字）',
    example: 'password123',
  })
  @MinLength(8)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).{8,}$/)
  password: string;

  @ApiProperty({
    description: '聯絡電話（不含國碼）',
    example: '0123456789',
  })
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({
    description: '重定向 URL',
    example: 'https://example.com/dashboard',
  })
  @IsOptional()
  redirect?: string;
}
