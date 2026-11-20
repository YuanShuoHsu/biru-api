import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsRFC3339,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class CreateInventoryReceiptItemDto {
  @ApiProperty()
  @IsString()
  ingredientId: string;

  @ApiPropertyOptional({
    example: '2',
    description:
      '到貨的包裝數，依食材的包裝規格換算成庫存數量；與 quantity 擇一，沒有包裝規格的食材只能填 quantity',
  })
  @IsOptional()
  @Matches(/^(?=.*[1-9])\d{1,6}(\.\d{1,3})?$/)
  @IsNumberString()
  packages?: string;

  @ApiPropertyOptional({
    example: '2000.000',
    description: '到貨的數量，單位為食材的 unitCode；與 packages 擇一',
  })
  @IsOptional()
  @Matches(/^(?=.*[1-9])\d{1,9}(\.\d{1,3})?$/)
  @IsNumberString()
  quantity?: string;
}

export class CreateInventoryReceiptDto {
  @ApiPropertyOptional({ description: '省略表示不指定供應商' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  supplierId?: string;

  @ApiPropertyOptional({ description: '到貨時間，省略則為送出當下' })
  @IsOptional()
  @IsRFC3339()
  @IsISO8601({ strict: true })
  receivedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiProperty({ type: [CreateInventoryReceiptItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((item: CreateInventoryReceiptItemDto) => item.ingredientId)
  @ValidateNested({ each: true })
  @Type(() => CreateInventoryReceiptItemDto)
  items: CreateInventoryReceiptItemDto[];
}
