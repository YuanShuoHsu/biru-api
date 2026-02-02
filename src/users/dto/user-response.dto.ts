import { ApiProperty } from '@nestjs/swagger';

import { GenderEnum, RoleEnum } from 'src/common/enums/user';

export class UserResponseDto {
  @ApiProperty({
    description: 'ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({ description: '姓名', example: 'Coffee' })
  name: string;

  @ApiProperty({
    description: '生日',
    example: '2024-04-04',
    format: 'date',
  })
  birthDate: Date | null;

  @ApiProperty({
    description: '建立時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  createdAt: Date;

  @ApiProperty({ description: '電子郵件', example: 'biru@example.com' })
  email: string;

  @ApiProperty({
    description: '是否訂閱電子報',
    example: true,
  })
  emailSubscribed: boolean;

  @ApiProperty({
    description: '是否已驗證電子郵件',
    example: true,
  })
  emailVerified: boolean;

  @ApiProperty({
    description: '名',
    example: 'Coffee',
  })
  firstName: string;

  @ApiProperty({
    description: '性別',
    enum: GenderEnum,
    example: GenderEnum.OTHER,
  })
  gender: GenderEnum;

  @ApiProperty({
    description: '頭像 URL',
    example: 'https://example.com/avatar.png',
  })
  image: string | null;

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
  role: RoleEnum;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}
