import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { InventoryTransactionResponseDto } from './inventory-transaction-response.dto.js';

export class InventoryReceiptResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  supplierId: string | null;
  @ApiProperty() receivedAt: Date;
  @ApiPropertyOptional({ nullable: true, type: String }) note: string | null;
  @ApiPropertyOptional({
    description: '點收人',
    nullable: true,
    type: String,
  })
  createdBy: string | null;
  @ApiProperty({ type: [InventoryTransactionResponseDto] })
  inventoryTransactions: InventoryTransactionResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
