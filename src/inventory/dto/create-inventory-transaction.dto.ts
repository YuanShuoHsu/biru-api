import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateInventoryTransactionDto {
  @ApiProperty({
    example: '500.000',
    description: '清點後的現有數量；異動量由系統與帳上數量相減求得',
  })
  @IsNumberString()
  inventoryLevel: string;

  @ApiPropertyOptional({ description: '異動原因，自由填寫' })
  @IsOptional()
  @IsString()
  note?: string | null;
}
