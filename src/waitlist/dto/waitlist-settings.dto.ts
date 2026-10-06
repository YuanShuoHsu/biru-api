import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
}

export class UpdateWaitlistPausedDto {
  @ApiProperty()
  @IsBoolean()
  paused: boolean;
}

export class WaitlistSettingsResponseDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty({ type: [WaitlistGroupDto] }) groups: WaitlistGroupDto[];
  @ApiProperty() paused: boolean;
}
