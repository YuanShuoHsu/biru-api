import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateMenuItemModifierGroupDto {
  @ApiProperty({ description: '要掛到此品項的選項群組 ID' })
  @IsString()
  modifierGroupId: string;
}
