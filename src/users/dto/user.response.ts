import { ApiProperty } from '@nestjs/swagger';
import { Provider, Role } from '@prisma/client';

import { IsEmail, IsNotEmpty, IsUrl } from 'class-validator';

export class UserResponseDto {
  @ApiProperty({ description: '使用者 ID', example: 1 })
  id: number;

  @ApiProperty({
    description: '建立時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: '電子郵件',
    example: 'birucoffee@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: '名',
    example: 'Coffee',
  })
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    description: '姓',
    example: 'Biru',
  })
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    description: '頭像 URL',
    example: 'https://example.com/avatar.png',
  })
  @IsUrl()
  photo: string;

  @ApiProperty({
    description: '身份驗證提供者',
    enum: Provider,
    example: Provider.google,
  })
  provider: Provider;

  @ApiProperty({
    description: '角色',
    enum: Role,
    example: Role.user,
  })
  role: Role;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}
