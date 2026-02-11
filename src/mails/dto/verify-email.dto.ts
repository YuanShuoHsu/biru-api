import { ApiProperty } from '@nestjs/swagger';

import { IsEmail, IsNotEmpty } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class VerifyEmailDto {
  @ApiProperty({
    description: '使用者 Email',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: i18nValidationMessage('validation.isEmail') })
  email: string;

  @ApiProperty({
    description: '信箱驗證 Token',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsNotEmpty({ message: i18nValidationMessage('validation.isNotEmpty') })
  token: string;
}
