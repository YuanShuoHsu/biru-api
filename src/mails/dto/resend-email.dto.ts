import { ApiProperty } from '@nestjs/swagger';

import { IsNotEmpty, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ResendEmailDto {
  @ApiProperty({
    description: '使用者 ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsNotEmpty({ message: i18nValidationMessage('validation.isNotEmpty') })
  identifier: string;

  @ApiProperty({
    description: '重定向 URL',
    example: '/dashboard',
  })
  @IsOptional()
  redirect?: string;
}
