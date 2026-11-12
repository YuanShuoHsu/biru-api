import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class KitchenOrdersQueryDto {
  @ApiPropertyOptional({
    description: '只列有工作單送到這台工作單印表機的訂單',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  printerId?: string;
}
