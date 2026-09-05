import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import { IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: '全國食材廣場' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telephone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
