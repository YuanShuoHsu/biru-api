import { ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { PICKUP_MAX_MINUTES } from '../../common/constants/pickup.js';

export class PrepEstimateQueryDto {
  @ApiPropertyOptional({
    description:
      '本單品項與加購中最長的備餐時間（分鐘），會與門市備餐時間取較大者',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(PICKUP_MAX_MINUTES)
  leadMinutes?: number;
}
