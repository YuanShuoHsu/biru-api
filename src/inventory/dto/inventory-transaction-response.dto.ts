import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const INVENTORY_TRANSACTION_REASONS = [
  'count',
  'consume',
  'restore',
] as const;

export type InventoryTransactionReason =
  (typeof INVENTORY_TRANSACTION_REASONS)[number];

export class InventoryTransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() ingredientId: string;
  @ApiProperty() organizationId: string;
  @ApiProperty({ description: '帶正負的異動量' }) quantity: string;
  @ApiProperty({
    enum: INVENTORY_TRANSACTION_REASONS,
    enumName: 'InventoryTransactionReason',
  })
  reason: InventoryTransactionReason;
  @ApiPropertyOptional() unitCost: string | null;
  @ApiPropertyOptional() orderId: string | null;
  @ApiPropertyOptional() orderNumber: string | null;
  @ApiPropertyOptional() note: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
