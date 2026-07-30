import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsDateString, IsOptional } from 'class-validator';

export class MenuItemSalesQueryDto {
  @ApiPropertyOptional({
    description: '統計起始時間；預設為近 30 天',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  since?: string;
}

export class MenuItemSalesResponseDto {
  @ApiProperty()
  menuItemId: string;

  @ApiProperty({ description: '最近一次的訂單品項名稱快照' })
  menuItemName: string;

  @ApiProperty({ description: '視窗內售出數量，含被加購的次數' })
  sold: number;
}
