import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  Min,
} from 'class-validator';

export class ReorderDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ default: 0 })
  @IsInt()
  @Min(0)
  offset: number;
}
