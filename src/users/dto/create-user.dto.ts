import { ApiProperty } from '@nestjs/swagger';

import { IsEmail, Matches, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: '電子郵件',
    example: 'birucoffee@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '名', example: 'Coffee' })
  firstName: string;

  @ApiProperty({ description: '姓', example: 'Biru' })
  lastName: string;

  @ApiProperty({
    description: '密碼（至少 8 碼，需包含英文字母與數字）',
    example: 'password123',
  })
  @MinLength(8)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).{8,}$/)
  password: string;
}
