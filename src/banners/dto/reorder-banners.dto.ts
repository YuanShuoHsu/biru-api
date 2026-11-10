import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ReorderBannersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  ids: string[];

  @ApiPropertyOptional({
    deprecated: true,
    description: '已不使用，之後會移除',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
