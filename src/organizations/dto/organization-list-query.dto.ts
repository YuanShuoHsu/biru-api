import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class OrganizationListQueryDto {
  @ApiPropertyOptional({ description: '含停業的組織；限平台管理員' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true')
  @IsBoolean()
  includeClosed?: boolean;
}
