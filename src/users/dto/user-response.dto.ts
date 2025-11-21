import { ApiProperty } from '@nestjs/swagger';

import { IsEmail, IsNotEmpty, IsUrl } from 'class-validator';
import { Role } from 'prisma/generated/client';

export class UserResponseDto {
  @ApiProperty({
    description: '使用者 ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({ description: '電話國碼', example: '+886' })
  countryCode: string;

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

  @ApiProperty({ description: '是否已驗證電子郵件', example: false })
  emailVerified: boolean;

  @ApiProperty({
    description: '名',
    example: 'Coffee',
  })
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    description: '頭像 URL',
    example: 'https://example.com/avatar.png',
  })
  @IsUrl()
  image: string;

  @ApiProperty({
    description: '姓',
    example: 'Biru',
  })
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ description: '電話', example: '0912345678', nullable: true })
  phone: string | null;

  @ApiProperty({ description: '是否已驗證電話', example: false })
  phoneVerified: boolean;

  @ApiProperty({
    description: '角色',
    enum: Role,
    example: Role.USER,
  })
  role: Role;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}
