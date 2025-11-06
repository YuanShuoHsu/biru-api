// src/users/dto/update-profile.dto.ts

import { ApiProperty } from '@nestjs/swagger';

import { IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ description: '電話國碼', example: '+886' })
  @IsNotEmpty()
  @IsOptional()
  countryCode?: string;

  @ApiProperty({ description: '名', example: 'Coffee' })
  @IsNotEmpty()
  @IsOptional()
  firstName?: string;

  @ApiProperty({
    description: '頭像 URL',
    example: 'https://example.com/avatar.png',
  })
  @IsOptional()
  @IsUrl()
  image?: string;

  @ApiProperty({ description: '姓', example: 'Biru' })
  @IsNotEmpty()
  @IsOptional()
  lastName?: string;

  @ApiProperty({
    description: '聯絡電話',
    example: '0912345678',
  })
  @IsNotEmpty()
  @IsOptional()
  phone?: string;
}
