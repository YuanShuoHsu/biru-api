import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class SendTestEmailDto {
  @ApiProperty({
    description: '收件人 Email',
    example: 'user@example.com',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}
