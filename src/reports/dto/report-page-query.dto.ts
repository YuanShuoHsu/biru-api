import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ReportPageQueryDto extends OmitType(PaginationQueryDto, [
  'limit',
] as const) {
  @ApiPropertyOptional({ description: '每頁列數；省略時回傳所有列' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
