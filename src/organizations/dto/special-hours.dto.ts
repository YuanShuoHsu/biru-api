import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidateIf,
} from 'class-validator';

import { IsOpeningHours } from '../../menus/dto/create-offer.dto.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateSpecialHoursDto {
  @ApiProperty({ example: '2027-02-05', description: '開始日期（平台時區）' })
  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  validFrom: string;

  @ApiProperty({
    example: '2027-02-07',
    description: '結束日期（平台時區，含當天）',
  })
  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  validThrough: string;

  @ApiProperty({
    description:
      '期間內各天依星期套用，格式同門市營業時間（如 "Mo-Su 10:00-15:00"）；null 代表整天公休',
    nullable: true,
    type: String,
  })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  @Validate(IsOpeningHours)
  openingHours: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: '颱風停業',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  note?: string | null;
}

export class UpdateSpecialHoursDto extends PartialType(CreateSpecialHoursDto, {
  skipNullProperties: false,
}) {}

export class SpecialHoursDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty({ example: '2027-02-05' }) validFrom: string;
  @ApiProperty({ example: '2027-02-07' }) validThrough: string;
  @ApiProperty({ nullable: true, type: String }) openingHours: string | null;
  @ApiProperty({ nullable: true, type: String }) note: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
