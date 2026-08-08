import { ApiProperty } from '@nestjs/swagger';

import {
  DEFAULT_LANGUAGE,
  languagesEnum,
  type Language,
} from 'src/db/schema/enums';
import { userRoles, type UserRole } from 'src/db/schema/users';

export class UserResponseDto {
  @ApiProperty({
    description: 'ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: '角色',
    enum: userRoles,
    enumName: 'UserRole',
    example: 'user',
  })
  role: UserRole | null;

  @ApiProperty({ description: '是否已封鎖', example: false })
  banned: boolean | null;

  @ApiProperty({ description: '封鎖原因', example: '違反使用條款' })
  banReason?: string | null;

  @ApiProperty({
    description: '封鎖到期時間；null 為永久',
    example: '2025-12-31T23:59:59.000Z',
  })
  banExpires?: Date | null;

  @ApiProperty({ description: '個人簡介', example: '喜歡精釀啤酒' })
  bio?: string | null;

  @ApiProperty({ description: '姓名', example: 'Coffee' })
  name: string;

  // @ApiProperty({
  //   description: '生日',
  //   example: '2024-04-04',
  //   format: 'date',
  // })
  // birthDate: Date | null;

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

  // @ApiProperty({
  //   description: '性別',
  //   enum: gendersEnum.enumValues,
  //   example: DEFAULT_GENDER,
  // })
  // gender: Gender;

  @ApiProperty({
    description: '頭像 URL',
    example: 'https://example.com/avatar.png',
  })
  image?: string | null;

  @ApiProperty({
    description: '語言',
    enum: languagesEnum.enumValues,
    example: DEFAULT_LANGUAGE,
  })
  lang: Language;

  @ApiProperty({
    description: '姓',
    example: 'Biru',
  })
  lastName?: string | null;

  @ApiProperty({ description: '電話（E.164 格式）', example: '+886912345678' })
  phoneNumber?: string | null;

  @ApiProperty({ description: '是否已驗證電話', example: false })
  phoneNumberVerified: boolean;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}
