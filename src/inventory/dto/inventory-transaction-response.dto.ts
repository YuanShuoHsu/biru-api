import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  inventoryTransactionTypeEnum,
  type InventoryTransactionType,
} from 'src/db/schema/inventory';

export class InventoryTransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() ingredientId: string;
  @ApiProperty() organizationId: string;
  @ApiProperty({
    enum: inventoryTransactionTypeEnum.enumValues,
    enumName: 'InventoryTransactionType',
  })
  type: InventoryTransactionType;
  @ApiProperty({ description: '帶正負的異動量' }) quantity: string;
  @ApiPropertyOptional() unitCost: string | null;
  @ApiPropertyOptional() orderId: string | null;
  @ApiPropertyOptional() note: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
