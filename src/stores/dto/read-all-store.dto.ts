import { ApiProperty } from '@nestjs/swagger';
import { JsonValue } from '@prisma/client/runtime/library';

export class StoreDto {
  @ApiProperty({
    example: 'aerotropolis',
  })
  id: string;

  @ApiProperty({
    example: {
      'zh-TW': '航空城店',
      en: 'Aerotropolis',
      ja: 'エアロトロポリス店',
      ko: '에어로트로폴리스점',
      'zh-CN': '航空城店',
    },
  })
  name: JsonValue;

  createdAt: Date;

  isActive: boolean;

  updatedAt: Date;
}
