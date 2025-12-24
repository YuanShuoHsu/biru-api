import { ApiProperty } from '@nestjs/swagger';

import { IsNotEmpty } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: '信箱驗證 Token',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsNotEmpty()
  token: string;
}
