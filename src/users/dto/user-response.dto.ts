import { ApiProperty } from '@nestjs/swagger';

import type { Gender, Role } from 'prisma/generated/client';
import { Gender as GenderEnum, Role as RoleEnum } from 'prisma/generated/enums';

export class UserResponseDto {
  @ApiProperty({
    description: '使用者 ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: '生日',
    example: '2024-04-04',
    format: 'date',
  })
  birthDate: Date | null;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 國家代碼', example: 'TW' })
  countryCode: string;

  @ApiProperty({ description: '國家名稱', example: 'Taiwan' })
  countryLabel: string;

  @ApiProperty({ description: '國際電話區號', example: '+886' })
  countryPhone: string;

  @ApiProperty({
    description: '建立時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: '電子郵件',
    example: 'birucoffee@example.com',
  })
  email: string;

  @ApiProperty({ description: '是否已驗證電子郵件', example: false })
  emailVerified: boolean;

  @ApiProperty({
    description: '電子郵件驗證時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  emailVerifiedAt: Date | null;

  @ApiProperty({
    description: '名',
    example: 'Coffee',
  })
  firstName: string;

  @ApiProperty({
    description: '性別',
    enum: GenderEnum,
    example: GenderEnum.NOT_DISCLOSED,
  })
  gender: Gender;

  @ApiProperty({
    description: '頭像 URL',
    example: 'https://example.com/avatar.png',
  })
  image: string | null;

  @ApiProperty({
    description: '是否訂閱電子報',
    example: true,
  })
  isSubscribed: boolean;

  @ApiProperty({
    description: '姓',
    example: 'Biru',
  })
  lastName: string;

  @ApiProperty({ description: '電話（不含國碼）', example: '0123456789' })
  phoneNumber: string | null;

  @ApiProperty({ description: '是否已驗證電話', example: false })
  phoneVerified: boolean;

  @ApiProperty({
    description: '角色',
    enum: RoleEnum,
    example: RoleEnum.USER,
  })
  role: Role;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}
