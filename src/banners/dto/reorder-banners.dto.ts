import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsString, Min } from 'class-validator';

export class ReorderBannersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ default: 0 })
  @IsInt()
  @Min(0)
  offset: number;
}
