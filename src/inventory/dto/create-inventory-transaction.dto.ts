import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';

export const MANUAL_INVENTORY_TRANSACTION_TYPES = [
  'purchase',
  'consumption',
  'adjustment',
  'waste',
] as const;

export type ManualInventoryTransactionType =
  (typeof MANUAL_INVENTORY_TRANSACTION_TYPES)[number];

export class CreateInventoryTransactionDto {
  @ApiProperty({
    enum: MANUAL_INVENTORY_TRANSACTION_TYPES,
    enumName: 'ManualInventoryTransactionType',
  })
  @IsIn(MANUAL_INVENTORY_TRANSACTION_TYPES)
  type: ManualInventoryTransactionType;

  @ApiProperty({
    example: '500.000',
    description: 'adjustment 帶盤點後實數，其餘帶異動量（一律為正）',
  })
  @IsNumberString()
  quantity: string;

  @ApiPropertyOptional({ example: '9.5000', description: '進貨單價' })
  @IsOptional()
  @IsNumberString()
  unitCost?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;
}
