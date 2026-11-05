import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsNumberString, IsOptional, IsString, Matches } from 'class-validator';

export class CreateIngredientBatchDto {
  @ApiProperty({
    example: '2300.000',
    description: '這批實際產出的數量，單位為食材的 unitCode',
  })
  @Matches(/^(?=.*[1-9])\d{1,9}(\.\d{1,3})?$/)
  @IsNumberString()
  quantity: string;

  @ApiPropertyOptional({ description: '異動原因，自由填寫' })
  @IsOptional()
  @IsString()
  note?: string | null;
}
