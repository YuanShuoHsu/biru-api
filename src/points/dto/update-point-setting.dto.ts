import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdatePointSettingDto {
  @ApiPropertyOptional({
    description: '消費多少元換 1 點；null = 停用點數',
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  amountPerPoint?: number | null;

  @ApiPropertyOptional({
    description: '點數有效年限；null = 不會到期',
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pointsValidityYears?: number | null;

  @ApiPropertyOptional({
    description: '每點的會計價值（元），只用於對帳',
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  accountingValuePerPoint?: number | null;
}
