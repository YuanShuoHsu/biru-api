import { ApiProperty } from '@nestjs/swagger';

import { IsEmail, IsNotEmpty, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ResendEmailDto {
  @ApiProperty({
    description: '電子信箱',
    example: 'test@example.com',
  })
  @IsNotEmpty({ message: i18nValidationMessage('validation.isNotEmpty') })
  @IsEmail({}, { message: i18nValidationMessage('validation.isEmail') })
  email: string;

  @ApiProperty({
    description: '重定向 URL',
    example: '/dashboard',
  })
  @IsOptional()
  redirect?: string;
}
