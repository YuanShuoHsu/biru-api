import { ApiProperty } from '@nestjs/swagger';

import { IsUUID, MaxLength } from 'class-validator';

import { LocalizedFieldDto } from 'src/common/dto/localized-field.dto';

export class ReadStoreDto {
  @ApiProperty({
    description: '門市 ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  id: string;

  @ApiProperty({
    description: '門市名稱',
    type: LocalizedFieldDto,
  })
  name: LocalizedFieldDto;

  @ApiProperty({
    description: '建立時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: '是否啟用',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: '門市代稱',
    example: 'aerotropolis',
  })
  @MaxLength(64)
  slug: string;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}
