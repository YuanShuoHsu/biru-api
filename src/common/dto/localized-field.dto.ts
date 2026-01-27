import { ApiProperty } from '@nestjs/swagger';

export class LocalizedFieldDto {
  @ApiProperty({ example: '繁體中文' })
  'zh-TW': string;

  @ApiProperty({ example: 'English' })
  en: string;

  @ApiProperty({ example: '日本語' })
  ja: string;

  @ApiProperty({ example: '한국어' })
  ko: string;

  @ApiProperty({ example: '简体中文' })
  'zh-CN': string;
}
