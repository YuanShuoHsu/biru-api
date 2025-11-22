import { ApiProperty } from '@nestjs/swagger';

import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  Matches,
  MinLength,
} from 'class-validator';
import type { Gender } from 'prisma/generated/client';
import { Gender as GenderEnum } from 'prisma/generated/enums';

export class CreateUserDto {
  @ApiProperty({
    description: '生日',
    example: '2024-04-04',
  })
  @IsDateString()
  birthDate: string;

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
    example: GenderEnum.NOT_DISCLOSED,
  })
  @IsEnum(GenderEnum)
  gender: Gender;

  @ApiProperty({ description: '姓（選填）', example: 'Biru' })
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    description: '密碼（至少 8 碼，需包含英文字母與數字）',
    example: 'password123',
  })
  @MinLength(8)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).{8,}$/)
  password: string;
}
