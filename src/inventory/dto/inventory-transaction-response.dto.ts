import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InventoryTransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() ingredientId: string;
  @ApiProperty() organizationId: string;
  @ApiProperty({ description: '帶正負的異動量' }) quantity: string;
  @ApiPropertyOptional() unitCost: string | null;
  @ApiPropertyOptional() orderId: string | null;
  @ApiPropertyOptional() note: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
