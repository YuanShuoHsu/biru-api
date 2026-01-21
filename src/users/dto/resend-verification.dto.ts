import { ApiProperty } from '@nestjs/swagger';

import { IsEmail, IsNotEmpty } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ResendVerificationDto {
  @ApiProperty({
    description: '電子信箱',
    example: 'test@example.com',
  })
  @IsNotEmpty({ message: i18nValidationMessage('validation.IS_NOT_EMPTY') })
  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  email: string;
}
