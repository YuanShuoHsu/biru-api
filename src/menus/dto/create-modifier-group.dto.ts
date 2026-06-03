import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateModifierGroupDto {
  @ApiProperty({ description: '群組名稱，如「甜度」「加料」' })
  @IsString()
  displayName: string;

  @ApiPropertyOptional({
    default: 0,
    description: '最少選擇數量；>= 1 代表必選',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minSelectionCount?: number;

  @ApiPropertyOptional({
    nullable: true,
    description: '最多選擇數量；min=max=1 為單選，null 為不限',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelectionCount?: number | null;
}
