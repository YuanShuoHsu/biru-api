import { ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PrepEstimateQueryDto {
  @ApiPropertyOptional({
    description: '本單品項中最長的備餐時間（分鐘），會與門市備餐時間取較大者',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  leadMinutes?: number;
}
