import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { WaitlistGroupDto } from './waitlist-group.dto';

export class UpdateWaitlistSettingsDto {
  @ApiProperty({ description: '打烊前幾分鐘停止顧客自助取號', example: 60 })
  @IsInt()
  @Min(0)
  @Max(240)
  cutoffMinutes: number;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ type: [WaitlistGroupDto] })
  @IsArray()
  @ArrayMaxSize(26)
  @ValidateNested({ each: true })
  @Type(() => WaitlistGroupDto)
  groups: WaitlistGroupDto[];

  @ApiProperty({
    description: '保留期限過後再等幾分鐘自動過號，0 為不自動過號',
    example: 10,
  })
  @IsInt()
  @Min(0)
  @Max(60)
  graceMinutes: number;

  @ApiProperty({ description: '叫號後保留分鐘數', example: 10 })
  @IsInt()
  @Min(1)
  @Max(60)
  holdMinutes: number;
}

export class UpdateWaitlistPausedDto {
  @ApiProperty()
  @IsBoolean()
  paused: boolean;
}

export class WaitlistSettingsResponseDto {
  @ApiProperty({ description: '打烊前幾分鐘停止顧客自助取號' })
  cutoffMinutes: number;
  @ApiProperty() enabled: boolean;
  @ApiProperty({ type: [WaitlistGroupDto] }) groups: WaitlistGroupDto[];
  @ApiProperty({
    description: '保留期限過後再等幾分鐘自動過號，0 為不自動過號',
  })
  graceMinutes: number;
  @ApiProperty({ description: '叫號後保留分鐘數' }) holdMinutes: number;
  @ApiProperty() paused: boolean;
}
