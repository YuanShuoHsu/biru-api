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
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ type: [WaitlistGroupDto] })
  @IsArray()
  @ArrayMaxSize(26)
  @ValidateNested({ each: true })
  @Type(() => WaitlistGroupDto)
  groups: WaitlistGroupDto[];

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
  @ApiProperty() enabled: boolean;
  @ApiProperty({ type: [WaitlistGroupDto] }) groups: WaitlistGroupDto[];
  @ApiProperty({ description: '叫號後保留分鐘數' }) holdMinutes: number;
  @ApiProperty() paused: boolean;
}
