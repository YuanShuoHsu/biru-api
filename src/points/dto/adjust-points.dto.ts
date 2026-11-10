import { ApiProperty } from '@nestjs/swagger';

import {
  IsEmail,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';

export class AdjustPointsDto {
  @ApiProperty({ description: '調整對象的會員 email' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '正數為補點、負數為扣點' })
  @IsInt()
  @NotEquals(0)
  @Min(-100000)
  @Max(100000)
  points: number;

  @ApiProperty({ description: '調整原因' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  note: string;
}
